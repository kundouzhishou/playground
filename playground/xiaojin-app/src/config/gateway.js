// Gateway 配置
export const GATEWAY_CONFIG = {
  url: 'wss://gw.web3hunter.org',
  token: 'fP1pmxi1N44VKPyYkJtEDlr5cBTXmuUoJm62etkG0_Y',
  sessionKey: 'xiaojin-voice',
  protocol: {
    min: 3,
    max: 3
  },
  client: {
    id: 'cli',
    version: '1.0.0',
    platform: 'ios',
    mode: 'cli'
  },
  role: 'operator',
  scopes: ['operator.read', 'operator.write', 'operator.admin']
};
