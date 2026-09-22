import { createApp } from '../src/main';

let cachedApp: any;

export default async function handler(req: any, res: any) {
  if (!cachedApp) {
    cachedApp = await createApp();
  }

  const instance = cachedApp.getHttpAdapter().getInstance();

  return instance(req, res);
}