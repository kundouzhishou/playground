#!/usr/bin/env node

/**
 * 检测 App Store 上的应用版本
 *
 * 用法：
 *   node scripts/check-appstore-version.js           # 检测当前版本是否已上架
 *   node scripts/check-appstore-version.js 1.1.2    # 检测指定版本是否已上架
 *   node scripts/check-appstore-version.js --watch  # 持续监控直到版本上架
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// 应用配置
const BUNDLE_ID = 'com.yilian.gouda';
const APP_ID = '6756522361';
const COUNTRY = 'cn';

// 从 app.json 读取当前版本
function getCurrentVersion() {
    const appJsonPath = path.join(__dirname, '..', 'app.json');
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    return appJson.expo.version;
}

// 查询 App Store 版本
function fetchAppStoreVersion() {
    return new Promise((resolve, reject) => {
        const url = `https://itunes.apple.com/lookup?bundleId=${BUNDLE_ID}&country=${COUNTRY}`;

        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.resultCount > 0) {
                        resolve({
                            version: json.results[0].version,
                            name: json.results[0].trackName,
                            releaseDate: json.results[0].currentVersionReleaseDate,
                            url: json.results[0].trackViewUrl,
                        });
                    } else {
                        resolve(null); // 应用未上架
                    }
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// 比较版本号
function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
    }
    return 0;
}

// 格式化时间
function formatTime() {
    return new Date().toLocaleString('zh-CN', { hour12: false });
}

// 主函数
async function main() {
    const args = process.argv.slice(2);
    const watchMode = args.includes('--watch');
    const targetVersion = args.find(arg => !arg.startsWith('--')) || getCurrentVersion();

    console.log(`🔍 检测 App Store 版本`);
    console.log(`   Bundle ID: ${BUNDLE_ID}`);
    console.log(`   目标版本: ${targetVersion}`);
    console.log('');

    const check = async () => {
        try {
            const appStore = await fetchAppStoreVersion();

            if (!appStore) {
                console.log(`[${formatTime()}] ❌ 应用未在 App Store 上架`);
                return false;
            }

            const comparison = compareVersions(appStore.version, targetVersion);

            if (comparison >= 0) {
                console.log(`[${formatTime()}] ✅ 版本已上架！`);
                console.log(`   App Store 版本: ${appStore.version}`);
                console.log(`   发布时间: ${appStore.releaseDate}`);
                console.log(`   链接: ${appStore.url}`);
                return true;
            } else {
                console.log(`[${formatTime()}] ⏳ 等待中... App Store 当前版本: ${appStore.version}`);
                return false;
            }
        } catch (error) {
            console.error(`[${formatTime()}] ❌ 查询失败: ${error.message}`);
            return false;
        }
    };

    if (watchMode) {
        console.log('📡 监控模式：每 5 分钟检查一次，直到版本上架...\n');

        const poll = async () => {
            const success = await check();
            if (success) {
                console.log('\n🎉 版本已成功上架 App Store！');
                process.exit(0);
            }
        };

        await poll();
        setInterval(poll, 5 * 60 * 1000); // 每 5 分钟检查一次
    } else {
        const success = await check();
        process.exit(success ? 0 : 1);
    }
}

main();
