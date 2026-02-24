#!/usr/bin/env node

/**
 * 统一发布脚本
 *
 * 用法：
 *   npm run release -- patch    # OTA 热更新
 *   npm run release -- minor    # 新功能发布
 *   npm run release -- major    # 强制更新发布
 *
 * 版本号规则：
 *   x.y.z + updateVersion
 *   - patch: updateVersion +1, OTA 热更新
 *   - minor: z+1, 重置 updateVersion, EAS Build
 *   - major: y+1, z=0, 重置 updateVersion, EAS Build + 维护模式
 *
 * 环境配置：
 *   - main 分支 → prod 环境
 *   - develop 分支 → dev 环境
 *   - 发布时自动切换到 prod 环境，发布后自动切换回 dev 环境
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const tcb = require('@cloudbase/node-sdk');
const dotenv = require('dotenv');

const ROOT_DIR = path.join(__dirname, '..');

// 加载环境变量
dotenv.config({ path: path.join(ROOT_DIR, '.env') });
const VERSION_FILE = path.join(ROOT_DIR, 'version.json');
const APP_JSON_FILE = path.join(ROOT_DIR, 'app.json');
const ENV_FILE = path.join(ROOT_DIR, '.env');

// 环境配置
const ENV_CONFIG = {
    prod: 'gouda-prod-3ggmn1r4fbe69b7d',
    dev: 'gouda-4gcjz9rk90e8aab1',
};

// 分支与环境的对应关系
const BRANCH_ENV_MAP = {
    main: 'prod',
    develop: 'dev',
};

// 初始化 TCB Admin SDK（用于操作维护模式）
// 维护模式始终操作 prod 环境，所以从 .env.prod 读取凭证
let tcbApp = null;
let tcbDb = null;

function initTcbAdmin() {
    if (tcbApp) return;

    // 从 .env.prod 读取凭证（维护模式始终操作 prod 环境）
    const prodEnvPath = path.join(ROOT_DIR, '.env.prod');
    const prodEnvConfig = dotenv.parse(fs.readFileSync(prodEnvPath));

    const secretId = prodEnvConfig.TCB_SECRET_ID;
    const secretKey = prodEnvConfig.TCB_SECRET_KEY;

    if (!secretId || !secretKey) {
        throw new Error('❌ .env.prod 中缺少 TCB_SECRET_ID 或 TCB_SECRET_KEY');
    }

    tcbApp = tcb.init({
        env: ENV_CONFIG.prod,
        secretId,
        secretKey,
    });
    tcbDb = tcbApp.database();
    console.log('✅ TCB Admin SDK 初始化成功 (prod 环境)');
}

// 获取当前 .env 中的环境 ID
function getCurrentEnvId() {
    try {
        const envContent = fs.readFileSync(ENV_FILE, 'utf8');
        const match = envContent.match(/EXPO_PUBLIC_TCB_ENV_ID=(.+)/);
        return match ? match[1].trim() : null;
    } catch {
        return null;
    }
}

// 获取当前环境名称（prod/dev）
function getCurrentEnvName() {
    const envId = getCurrentEnvId();
    if (envId === ENV_CONFIG.prod) return 'prod';
    if (envId === ENV_CONFIG.dev) return 'dev';
    return 'unknown';
}

// 切换环境
function switchEnv(targetEnv) {
    const currentEnv = getCurrentEnvName();
    if (currentEnv === targetEnv) {
        console.log(`✅ 当前已是 ${targetEnv} 环境`);
        return;
    }

    console.log(`🔄 切换环境: ${currentEnv} → ${targetEnv}`);
    execSync(`npm run switch:${targetEnv}`, { cwd: ROOT_DIR, stdio: 'inherit' });
}

// 检查并切换到正确的环境
function ensureCorrectEnv(branch) {
    const expectedEnv = BRANCH_ENV_MAP[branch];
    if (!expectedEnv) {
        throw new Error(`❌ 未知分支: ${branch}`);
    }

    const currentEnv = getCurrentEnvName();
    if (currentEnv !== expectedEnv) {
        console.log(`⚠️ 环境不匹配: 当前 ${currentEnv}，${branch} 分支应使用 ${expectedEnv}`);
        switchEnv(expectedEnv);
    } else {
        console.log(`✅ 环境配置正确: ${currentEnv}`);
    }
}

// 解析命令行参数
function parseArgs() {
    const args = process.argv.slice(2);
    let releaseType = null;

    for (const arg of args) {
        if (arg === 'patch' || arg === 'minor' || arg === 'major' || arg === 'maintenance-off') {
            releaseType = arg;
        }
    }

    if (!releaseType) {
        console.error('❌ 请指定发布类型: patch | minor | major | maintenance-off');
        console.log('\n用法:');
        console.log('  npm run release -- patch           # OTA 热更新');
        console.log('  npm run release -- minor           # 新功能发布');
        console.log('  npm run release -- major           # 强制更新发布');
        console.log('  npm run release -- maintenance-off # 关闭维护模式');
        process.exit(1);
    }

    return { releaseType };
}

// 发布前检查
function preCheck() {
    console.log('🔍 发布前检查...\n');

    // 检查分支
    const branch = execSync('git branch --show-current', { cwd: ROOT_DIR })
        .toString()
        .trim();

    if (branch !== 'main' && branch !== 'develop') {
        throw new Error(`❌ 必须在 main 或 develop 分支执行发布，当前分支: ${branch}`);
    }
    console.log(`✅ 当前分支: ${branch}`);

    // 检查工作区
    const status = execSync('git status --porcelain', { cwd: ROOT_DIR })
        .toString()
        .trim();
    if (status) {
        throw new Error('❌ 工作区有未提交的更改:\n' + status);
    }
    console.log('✅ 工作区干净');

    // 如果在 develop 分支，自动切换到 main 并合并
    if (branch === 'develop') {
        console.log('\n🔄 从 develop 切换到 main 并合并...');

        execSync('git checkout main', { cwd: ROOT_DIR, stdio: 'inherit' });
        console.log('📥 拉取最新 main...');
        execSync('git pull origin main', { cwd: ROOT_DIR, stdio: 'inherit' });

        console.log('🔀 合并 develop 到 main...');
        execSync('git merge develop', { cwd: ROOT_DIR, stdio: 'inherit' });

        console.log('📤 推送 main...');
        execSync('git push origin main', { cwd: ROOT_DIR, stdio: 'inherit' });
    } else {
        // 在 main 分支（通常是 worktree），拉取最新代码并合并 develop
        console.log('📥 拉取最新代码...');
        execSync('git pull origin main', { cwd: ROOT_DIR, stdio: 'inherit' });

        // 自动合并远程 develop 分支的最新代码
        console.log('🔀 合并 origin/develop 到 main...');
        execSync('git fetch origin develop', { cwd: ROOT_DIR, stdio: 'inherit' });
        execSync('git merge origin/develop --no-edit', { cwd: ROOT_DIR, stdio: 'inherit' });
    }

    // 检查并切换到 prod 环境（发布必须使用 prod 环境）
    console.log('\n🔧 检查环境配置...');
    ensureCorrectEnv('main');

    console.log('');
}

// 读取版本信息
function readVersionInfo() {
    const appJson = JSON.parse(fs.readFileSync(APP_JSON_FILE, 'utf8'));
    let versionData = { updateVersion: 0, lastUpdated: new Date().toISOString() };

    try {
        versionData = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
    } catch {
        // 文件不存在，使用默认值
    }

    return {
        appVersion: appJson.expo.version || '1.0.0',
        updateVersion: versionData.updateVersion || 0,
        appJson,
        versionData,
    };
}

// 递增版本号
function bumpVersion(version, type) {
    const [major, minor, patch] = version.split('.').map(Number);
    switch (type) {
        case 'minor':
            return `${major}.${minor}.${patch + 1}`; // z+1
        case 'major':
            return `${major}.${minor + 1}.0`; // y+1, z=0
        default:
            return version;
    }
}

// 更新版本文件
function updateVersionFiles(newAppVersion, newUpdateVersion) {
    // 更新 version.json
    const newVersionData = {
        updateVersion: newUpdateVersion,
        lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(VERSION_FILE, JSON.stringify(newVersionData, null, 2) + '\n');

    // 更新 app.json
    const appJson = JSON.parse(fs.readFileSync(APP_JSON_FILE, 'utf8'));
    appJson.expo.version = newAppVersion;
    // runtimeVersion 使用 fingerprint policy，无需手动同步
    if (!appJson.expo.extra) {
        appJson.expo.extra = {};
    }
    appJson.expo.extra.updateVersion = newUpdateVersion;
    fs.writeFileSync(APP_JSON_FILE, JSON.stringify(appJson, null, 2) + '\n');
}

// 回滚版本文件
function rollbackVersionFiles() {
    console.log('⚠️ 回滚版本文件...');
    execSync('git checkout app.json version.json', { cwd: ROOT_DIR });
    console.log('✅ 版本文件已回滚');
}

// Git 提交和打标签
function gitCommitAndTag(version, releaseType, updateVersion) {
    console.log('\n📝 提交版本变更...');

    execSync('git add app.json version.json', { cwd: ROOT_DIR });

    let commitMessage;
    if (releaseType === 'patch') {
        commitMessage = `chore: OTA 更新 #${updateVersion}`;
    } else {
        commitMessage = `chore: 发布 v${version}`;
    }

    execSync(`git commit -m "${commitMessage}"`, { cwd: ROOT_DIR, stdio: 'inherit' });

    // 只有 minor/major 打 tag
    if (releaseType !== 'patch') {
        const tag = `v${version}`;
        console.log(`🏷️ 创建标签: ${tag}`);
        execSync(`git tag ${tag}`, { cwd: ROOT_DIR });
    }

    console.log('📤 推送到远程...');
    execSync('git push', { cwd: ROOT_DIR, stdio: 'inherit' });

    if (releaseType !== 'patch') {
        execSync('git push --tags', { cwd: ROOT_DIR, stdio: 'inherit' });
    }
}

// 同步到 develop 分支
function syncToDevelop() {
    console.log('\n🔄 同步到 develop 分支...');

    try {
        execSync('git checkout develop', { cwd: ROOT_DIR, stdio: 'inherit' });
        execSync('git merge main', { cwd: ROOT_DIR, stdio: 'inherit' });
        execSync('git push', { cwd: ROOT_DIR, stdio: 'inherit' });

        // 切换回 dev 环境
        console.log('\n🔧 切换回 dev 环境...');
        switchEnv('dev');

        console.log('✅ develop 分支已同步，当前在 develop 分支，环境已切换回 dev');
    } catch (error) {
        console.error('⚠️ 同步 develop 分支失败，请手动处理');
        // 失败时也尝试回到 develop 并切换环境
        try {
            execSync('git checkout develop', { cwd: ROOT_DIR, stdio: 'pipe' });
            switchEnv('dev');
        } catch {
            // 忽略
        }
    }
}

// 执行 EAS Update (OTA)
function runEasUpdate(updateVersion) {
    const command = `eas update --branch production --message "Update #${updateVersion}"`;

    console.log(`\n📤 执行 OTA 更新: ${command}\n`);

    execSync(command, { cwd: ROOT_DIR, stdio: 'inherit' });
}

// 执行 EAS Build (仅 iOS)
function runEasBuild() {
    // 构建 iOS（--non-interactive 避免交互式提示）
    const buildCommand = 'eas build -p ios --profile production --clear-cache --non-interactive';
    console.log(`\n🏗️ 执行构建: ${buildCommand}\n`);
    execSync(buildCommand, { cwd: ROOT_DIR, stdio: 'inherit' });

    // 提交 iOS 到 App Store Connect
    console.log('\n📤 提交 iOS 到 App Store Connect...\n');
    execSync('eas submit --platform ios --latest --non-interactive', { cwd: ROOT_DIR, stdio: 'inherit' });
}

// 用户确认
function askConfirmation(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}

// 倒计时
function countdown(seconds, message) {
    return new Promise((resolve) => {
        let remaining = seconds;
        const interval = setInterval(() => {
            process.stdout.write(`\r${message} ${remaining} 秒...   `);
            remaining--;
            if (remaining < 0) {
                clearInterval(interval);
                console.log('\n');
                resolve();
            }
        }, 1000);
    });
}

// 开启维护模式
async function enableMaintenanceMode() {
    console.log('\n🔧 开启维护模式...');

    initTcbAdmin();

    try {
        await tcbDb.collection('app_config').doc('maintenance').update({
            enabled: true,
        });
        console.log('✅ 维护模式已开启');
    } catch (error) {
        throw new Error(`❌ 开启维护模式失败: ${error.message}`);
    }
}

// 关闭维护模式
async function disableMaintenanceMode() {
    console.log('\n🔧 关闭维护模式...');

    initTcbAdmin();

    try {
        await tcbDb.collection('app_config').doc('maintenance').update({
            enabled: false,
        });
        console.log('✅ 维护模式已关闭');
    } catch (error) {
        console.error(`⚠️ 关闭维护模式失败: ${error.message}`);
        console.log('   请手动在云开发控制台关闭维护模式');
    }
}

// Patch 发布流程
async function releasePatch() {
    const { appVersion, updateVersion } = readVersionInfo();
    const newUpdateVersion = updateVersion + 1;

    console.log(`📦 Patch 发布 (OTA 热更新)`);
    console.log(`   应用版本: ${appVersion}`);
    console.log(`   更新版本: ${updateVersion} → ${newUpdateVersion}\n`);

    // 更新版本文件
    updateVersionFiles(appVersion, newUpdateVersion);

    try {
        // 执行 OTA 更新
        runEasUpdate(newUpdateVersion);

        // Git 提交
        gitCommitAndTag(appVersion, 'patch', newUpdateVersion);

        // 同步到 develop
        syncToDevelop();

        console.log('\n✅ Patch 发布完成！');
        console.log(`   版本: ${appVersion} (Update #${newUpdateVersion})`);
    } catch (error) {
        rollbackVersionFiles();
        throw error;
    }
}

// Minor 发布流程
async function releaseMinor() {
    const { appVersion, updateVersion } = readVersionInfo();
    const newAppVersion = bumpVersion(appVersion, 'minor');
    const newUpdateVersion = 0;

    console.log(`📦 Minor 发布 (新功能)`);
    console.log(`   应用版本: ${appVersion} → ${newAppVersion}`);
    console.log(`   更新版本: ${updateVersion} → ${newUpdateVersion} (重置)\n`);

    // 更新版本文件
    updateVersionFiles(newAppVersion, newUpdateVersion);

    try {
        // 执行 EAS Build
        runEasBuild();

        // Git 提交和打标签
        gitCommitAndTag(newAppVersion, 'minor', newUpdateVersion);

        // 同步到 develop
        syncToDevelop();

        console.log('\n✅ Minor 发布完成！');
        console.log(`   版本: v${newAppVersion}`);
        console.log(`   请在 TestFlight / Google Play Console 中查看构建结果`);
    } catch (error) {
        rollbackVersionFiles();
        throw error;
    }
}

// Major 发布流程
async function releaseMajor() {
    const { appVersion, updateVersion } = readVersionInfo();
    const newAppVersion = bumpVersion(appVersion, 'major');
    const newUpdateVersion = 0;

    console.log(`📦 Major 发布 (强制更新)`);
    console.log(`   应用版本: ${appVersion} → ${newAppVersion}`);
    console.log(`   更新版本: ${updateVersion} → ${newUpdateVersion} (重置)`);
    console.log(`\n⚠️ 警告: Major 发布将开启维护模式，所有用户将被强制更新！\n`);

    // 用户确认
    const confirmed = await askConfirmation('确认继续？(y/n): ');
    if (!confirmed) {
        console.log('❌ 用户取消发布');
        process.exit(0);
    }

    // 开启维护模式
    await enableMaintenanceMode();

    // 20 分钟倒计时
    console.log('\n⏳ 等待用户退出应用...');
    await countdown(20 * 60, '剩余');

    // 更新版本文件
    updateVersionFiles(newAppVersion, newUpdateVersion);

    try {
        // 执行 EAS Build
        runEasBuild();

        // Git 提交和打标签
        gitCommitAndTag(newAppVersion, 'major', newUpdateVersion);

        // 同步到 develop
        syncToDevelop();

        console.log('\n✅ Major 发布完成！');
        console.log(`   版本: v${newAppVersion}`);
        console.log(`\n📋 后续步骤:`);
        console.log(`   1. 等待 App Store / Google Play 审核通过`);
        console.log(`   2. 更新 app_config.version_control.min_app_version 为 ${newAppVersion}`);
        console.log(`   3. 审核通过后关闭维护模式`);

        // 询问是否现在关闭维护模式
        const closeNow = await askConfirmation('\n是否现在关闭维护模式？(y/n): ');
        if (closeNow) {
            await disableMaintenanceMode();
        } else {
            console.log('⚠️ 请记得在审核通过后手动关闭维护模式');
        }
    } catch (error) {
        rollbackVersionFiles();
        throw error;
    }
}

// 主函数
async function main() {
    console.log('🚀 狗搭发布脚本\n');

    const { releaseType } = parseArgs();

    try {
        // maintenance-off 不需要预检查
        if (releaseType === 'maintenance-off') {
            await disableMaintenanceMode();
            return;
        }

        // 发布前检查
        preCheck();

        // 根据类型执行发布
        switch (releaseType) {
            case 'patch':
                await releasePatch();
                break;
            case 'minor':
                await releaseMinor();
                break;
            case 'major':
                await releaseMajor();
                break;
        }
    } catch (error) {
        console.error('\n❌ 发布失败:', error.message || error);
        process.exit(1);
    }
}

main();
