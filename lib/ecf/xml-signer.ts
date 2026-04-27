/* eslint-disable @typescript-eslint/no-explicit-any */
// node-forge and @xmldom/xmldom have limited TypeScript type definitions;
// explicit any is necessary for interoperating with their internal APIs.
import * as forge from 'node-forge';
import { createHash } from 'crypto';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

export interface SignerOptions {
  p12Buffer: Buffer;
  p12Password: string;
}

export class XMLSignError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'XMLSignError';
  }
}

/**
 * Simple C14N canonicalization implementation for basic XML
 * Handles attribute sorting and whitespace normalization
 */
function simpleC14N(xmlString: string): string {
  // Remove extra whitespace between elements
  let canonical = xmlString.replace(/>\s+</g, '><');

  // Remove leading/trailing whitespace
  canonical = canonical.trim();

  try {
    const parser = new DOMParser({
      errorHandler: {
        warning: () => {},
        error: () => {},
        fatalError: () => {},
      },
    });

    const doc = parser.parseFromString(canonical, 'text/xml');
    const serializer = new XMLSerializer();

    // Sort attributes for consistent output
    const sortAttributes = (element: any) => {
      if (element.attributes) {
        const attrs = Array.from(element.attributes);
        attrs.sort((a: any, b: any) => a.name.localeCompare(b.name));

        // Remove and re-add attributes in sorted order
        attrs.forEach((attr: any) => {
          element.removeAttribute(attr.name);
        });
        attrs.forEach((attr: any) => {
          element.setAttribute(attr.name, attr.value);
        });
      }

      if (element.childNodes) {
        Array.from(element.childNodes).forEach((child: any) => {
          if (child.nodeType === 1) {
            sortAttributes(child);
          }
        });
      }
    };

    if (doc.documentElement) {
      sortAttributes(doc.documentElement);
    }
    canonical = serializer.serializeToString(doc);
  } catch (error) {
    // Use simplified canonical form if DOM parsing fails
    console.warn('Using basic canonicalization fallback:', String(error));
  }

  return canonical;
}

/**
 * Sign XML with RSA-SHA256 using digital certificate
 * Implements W3C XMLDSig with enveloped signature
 */
export async function signXML(xmlString: string, options: SignerOptions): Promise<string> {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    // Parse PKCS12 certificate
    const asn1 = forge.asn1.fromDer(options.p12Buffer.toString('binary'), false);
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, options.p12Password);
  } catch (error) {
    throw new XMLSignError(
      `Failed to parse PKCS12 certificate (likely wrong password): ${String(error)}`,
      error
    );
  }

  try {
    // Extract certificate and private key
    let certificate: any = null;
    let privateKey: any = null;

    if (p12.getBags) {
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });

      const certBagList = certBags?.[forge.pki.oids.certBag];
      if (certBagList && certBagList.length > 0) {
        certificate = certBagList[0];
      }

      const keyBagList = keyBags?.[forge.pki.oids.pkcs8ShroudedKeyBag];
      if (keyBagList && keyBagList.length > 0) {
        const keyBag = keyBagList[0];
        privateKey = keyBag.key;
      }

      // Try unencrypted key bag if shrouded was empty
      if (!privateKey) {
        const unshroudedBags = p12.getBags({ bagType: forge.pki.oids.keyBag });
        const list = unshroudedBags?.[forge.pki.oids.keyBag];
        if (list && list.length > 0) {
          privateKey = list[0].key;
        }
      }
    } else {
      // Fallback for different p12 structure
      const bags = (p12 as any).bags || p12;
      for (const bagType in bags) {
        if (bagType === forge.pki.oids.certBag) {
          certificate = bags[bagType][0];
        }
        if (bagType === forge.pki.oids.pkcs8ShroudedKeyBag) {
          privateKey = bags[bagType][0]?.key;
        }
      }
    }

    if (!privateKey) {
      throw new XMLSignError('Could not extract private key from certificate');
    }

    // Canonicalize the original XML
    const canonicalized = simpleC14N(xmlString);

    // Compute SHA-256 digest
    const digest = createHash('sha256').update(canonicalized).digest('base64');

    // Build SignedInfo
    const signedInfo = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/><Reference URI=""><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></Transforms><DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><DigestValue>${digest}</DigestValue></Reference></SignedInfo>`;

    // Canonicalize SignedInfo
    const canonicalizedSignedInfo = simpleC14N(signedInfo);

    // Sign with RSA-SHA256
    const md = forge.md.sha256.create();
    md.update(canonicalizedSignedInfo, 'utf8');

    const signature = privateKey.sign(md);
    const signatureValue = Buffer.from(signature, 'binary').toString('base64');

    // Build KeyInfo with certificate
    let certString = '';
    if (certificate && certificate.cert) {
      const certDer = forge.util.encode64(
        forge.asn1.toDer(forge.pki.certificateToAsn1(certificate.cert)).getBytes()
      );
      certString = certDer;
    }

    // Build Signature element
    const signatureElement = `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">${signedInfo}<SignatureValue>${signatureValue}</SignatureValue><KeyInfo><X509Data><X509Certificate>${certString}</X509Certificate></X509Data></KeyInfo></Signature>`;

    // Insert signature before closing root tag using regex (robust against whitespace/attrs)
    const closingRootRegex = /<\/ECF\s*>/;
    if (!closingRootRegex.test(xmlString)) {
      throw new XMLSignError(
        'Could not locate closing </ECF> tag in XML for signature insertion'
      );
    }
    const signedXML = xmlString.replace(closingRootRegex, `${signatureElement}</ECF>`);

    return signedXML;
  } catch (error) {
    if (error instanceof XMLSignError) {
      throw error;
    }
    throw new XMLSignError(`XML signing failed: ${String(error)}`, error);
  }
}
