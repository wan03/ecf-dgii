import { describe, it, expect, beforeAll } from 'vitest';
import * as forge from 'node-forge';
import { DOMParser } from '@xmldom/xmldom';
import { signXML, XMLSignError } from '@/lib/ecf/xml-signer';

const SAMPLE_XML =
  '<?xml version="1.0" encoding="UTF-8"?><ECF><Encabezado><Version>1.0</Version></Encabezado></ECF>';

let p12Buffer: Buffer;
const PASSWORD = 'test123';

beforeAll(() => {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);
  const attrs = [
    { name: 'commonName', value: 'test' },
    { name: 'countryName', value: 'DO' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], PASSWORD, {
    algorithm: '3des',
  });
  const der = forge.asn1.toDer(p12Asn1).getBytes();
  p12Buffer = Buffer.from(der, 'binary');
});

describe('signXML', () => {
  it('produces a signed XML with all expected nodes', async () => {
    const signed = await signXML(SAMPLE_XML, { p12Buffer, p12Password: PASSWORD });
    const doc = new DOMParser().parseFromString(signed, 'text/xml');

    const sig = doc.getElementsByTagName('Signature')[0];
    expect(sig).toBeTruthy();

    const digest = doc.getElementsByTagName('DigestValue')[0];
    expect(digest?.textContent?.length).toBeGreaterThan(0);

    const sigValue = doc.getElementsByTagName('SignatureValue')[0];
    expect(sigValue?.textContent?.length).toBeGreaterThan(0);

    const x509 = doc.getElementsByTagName('X509Certificate')[0];
    expect(x509?.textContent?.length).toBeGreaterThan(0);
  }, 20000);

  it('throws when the password is wrong', async () => {
    await expect(
      signXML(SAMPLE_XML, { p12Buffer, p12Password: 'wrong-password' })
    ).rejects.toThrow(XMLSignError);
  }, 20000);
});
