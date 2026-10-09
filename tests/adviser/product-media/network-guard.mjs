import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
const loopback = process.env.PRODUCT_MEDIA_TEST_LOOPBACK === 'true';
const allowed = host => loopback && ['localhost','127.0.0.1','::1'].includes(host);
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!allowed(url.hostname)) throw new Error('Media tests forbid external I/O');
  return originalFetch(input,options);
};
for (const module of [http,https]) for (const method of ['request','get']) {
  const original=module[method]; module[method]=function(input,...rest) {
    const host=typeof input==='string'||input instanceof URL ? new URL(input).hostname : input.hostname||input.host||'localhost';
    if(!allowed(host))throw new Error('Media tests forbid external transport');return original.call(this,input,...rest);
  };
}
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args) {
  const opts=Array.isArray(args[0])?args[0][0]:args[0];
  const host=typeof opts==='object' ? opts.host||'localhost' : typeof args[1]==='string'?args[1]:'localhost';
  if(!allowed(host))throw new Error('Media tests forbid external sockets');return connect.apply(this,args);
};
syncBuiltinESMExports();
