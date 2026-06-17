#!/usr/bin/env node
/**
 * 启动脚本：自动释放端口，然后启动服务器
 * 用法：node start.js [PORT]
 */

import { execSync } from 'child_process';
import { createServer } from 'net';

const PORT = parseInt(process.env.PORT || process.argv[2] || '3001', 10);

function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => { server.close(); resolve(false); });
    server.listen(port, '0.0.0.0');
  });
}

function killPort(port) {
  try {
    // Windows
    const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = result.split('\n').filter(l => l.includes('LISTENING'));
    const pids = [...new Set(lines.map(l => l.trim().split(/\s+/).pop()).filter(Boolean))];
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`✅ 已杀掉占用 ${port} 端口的进程 PID ${pid}`);
      } catch {}
    }
  } catch {}
}

async function main() {
  process.env.PORT = String(PORT);

  const inUse = await isPortInUse(PORT);
  if (inUse) {
    console.log(`⚠️  端口 ${PORT} 被占用，正在释放...`);
    killPort(PORT);
    await new Promise(r => setTimeout(r, 800));
  }

  const inUse2 = await isPortInUse(PORT);
  if (inUse2) {
    const alt = PORT + 1;
    console.log(`⚠️  端口 ${PORT} 仍被占用，改用 ${alt}`);
    process.env.PORT = String(alt);
  }

  console.log(`🚀 启动服务器，端口 ${process.env.PORT}...`);

  // 动态 import server.js（它会读 process.env.PORT）
  await import('./src/server.js');
}

main().catch(err => {
  console.error('启动失败：', err.message);
  process.exit(1);
});
