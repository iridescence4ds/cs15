import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import { signUploadParams, isOurCloudinaryAsset, type CloudinaryConfig } from '../utils/http/cloudinary.js';

// We don't need real Cloudinary creds for these tests — we just verify the
// signature algorithm matches the official spec and the URL validator works.

const FAKE_CFG: CloudinaryConfig = {
  cloudName: 'testcloud',
  apiKey: 'fakekey',
  apiSecret: 'fakesecret123',
  folder: 'yaksha',
};

describe('Cloudinary signature', () => {
  let OLD_ENV: NodeJS.ProcessEnv;

  beforeAll(() => {
    OLD_ENV = process.env;
    process.env = {
      ...OLD_ENV,
      CLOUDINARY_CLOUD_NAME: 'testcloud',
      CLOUDINARY_API_KEY: 'fakekey',
      CLOUDINARY_API_SECRET: 'fakesecret123',
      CLOUDINARY_FOLDER: 'yaksha',
    };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('signUploadParams returns a SHA1 signature built per Cloudinary spec', () => {
    // Reference: Cloudinary generates signature as
    //   SHA1( sorted(key=value) joined by "&" + api_secret )
    // We compute the expected value with the same algorithm and compare.
    const timestamp = 1700000000;
    const folder = 'yaksha/user123/posts';
    const params = { folder, timestamp };
    const toSign = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k as keyof typeof params]}`)
      .join('&');
    const expected = crypto.createHash('sha1').update(toSign + FAKE_CFG.apiSecret).digest('hex');

    const signed = signUploadParams(FAKE_CFG, { folder, timestamp });
    expect(signed.signature).toBe(expected);
    expect(signed.cloudName).toBe('testcloud');
    expect(signed.apiKey).toBe('fakekey');
    expect(signed.timestamp).toBe(timestamp);
    expect(signed.folder).toBe(folder);
  });

  it('signature changes when extra params change (no caching accidents)', () => {
    const a = signUploadParams(FAKE_CFG, { folder: 'yaksha/u/posts' });
    const b = signUploadParams(FAKE_CFG, { folder: 'yaksha/u/avatar' });
    expect(a.signature).not.toBe(b.signature);
  });

  it('signature is timestamp-aware — two timestamps get two signatures', () => {
    const a = signUploadParams(FAKE_CFG, { timestamp: 1 });
    const b = signUploadParams(FAKE_CFG, { timestamp: 2 });
    expect(a.signature).not.toBe(b.signature);
  });

  it('isOurCloudinaryAsset only accepts URLs on our configured cloud', () => {
    expect(isOurCloudinaryAsset('https://res.cloudinary.com/testcloud/image/upload/v1/x.jpg', 'testcloud')).toBe(true);
    expect(isOurCloudinaryAsset('https://res.cloudinary.com/evilcloud/image/upload/v1/x.jpg', 'testcloud')).toBe(false);
    expect(isOurCloudinaryAsset('https://example.com/foo.jpg', 'testcloud')).toBe(false);
  });
});
