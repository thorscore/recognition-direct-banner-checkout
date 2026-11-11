import assert from 'node:assert/strict';
import {test} from 'node:test';
import {inflateSync} from 'node:zlib';
import {rgbaArtworkPdf} from '../public/badge-preview/pdf-export.js';
import {renderProduction} from '../public/badge-preview/render.js';

test('PDF has exact physical boxes, lossless RGB artwork, alpha mask and valid object offsets', async () => {
  const width = 12, height = 6, data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([10, 80, 150, i % 2 ? 255 : 0], i * 4);
  const original = data.slice();
  const blob = await rgbaArtworkPdf({data, width, height, widthInches: .01, heightInches: .005});
  assert.equal(blob.type, 'application/pdf');
  const bytes = Buffer.from(await blob.arrayBuffer()), text = bytes.toString('latin1');
  assert.match(text, /^%PDF-1\.4/);
  for (const box of ['MediaBox', 'CropBox', 'TrimBox']) assert.ok(text.includes('/' + box + ' [0 0 0.72 0.36]'));
  assert.match(text, /\/PrintScaling \/None/);
  assert.match(text, /\/SMask 5 0 R/);
  assert.ok(!text.includes('/DCTDecode'));
  const offsets = [...text.matchAll(/(\d{10}) 00000 n /g)].map(match => Number(match[1]));
  assert.equal(offsets.length, 7);
  offsets.forEach((offset, i) => assert.equal(text.slice(offset, offset + 7), `${i + 1} 0 obj`));
  const xref = Number(/startxref\n(\d+)/.exec(text)[1]);
  assert.equal(text.slice(xref, xref + 4), 'xref');
  function decodedObject(id) {
    const start = offsets[id - 1], stream = text.indexOf('stream\n', start) + 7;
    const length = Number(/\/Length (\d+)/.exec(text.slice(start, stream))[1]);
    return inflateSync(bytes.subarray(stream, stream + length));
  }
  const rgb = decodedObject(4), alpha = decodedObject(5);
  assert.equal(rgb.length, width * height * 3); assert.equal(alpha.length, width * height);
  for (let i = 0; i < width * height; i++) {
    assert.deepEqual([...rgb.subarray(i * 3, i * 3 + 3)], [10, 80, 150]);
    assert.equal(alpha[i], data[i * 4 + 3]);
  }
  assert.deepEqual(data, original);
});

test('PDF rejects mismatched resolution, malformed pixels and oversized images', async () => {
  const valid = {data: new Uint8Array(12 * 6 * 4), width: 12, height: 6, widthInches: .01, heightInches: .005};
  for (const replacement of [{widthInches: 3}, {heightInches: 0}, {width: 0}, {data: []}, {data: new Uint8Array(3)}, {width: 5000, height: 5000}]) {
    await assert.rejects(rgbaArtworkPdf({...valid, ...replacement}), /actual-size PDF dimensions/);
  }
});

test('print render excludes stock, frame, dome, border and checkerboard at 1200 ppi', async () => {
  for (const family of ['standard', 'duets']) {
    const calls = [];
    const context = new Proxy({
      measureText(value) { return {width: value.length * 25, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 10}; },
    }, {get(target, key) { return key in target ? target[key] : (...args) => calls.push([key, ...args]); }});
    const canvas = {getContext: () => context};
    const configuration = {logoScale: 1, design: {
      family, size: '3x2', stockColor: family === 'standard' ? 'brushed-gold' : 'white', frame: family === 'standard' ? 'gold' : 'none',
      cornerRadius: '1/8', textAlignment: 'center', textSize: 70, layout: 'logo-left', textColor: '#111111',
      organization: '', dome: true, people: [{name: 'Jamie Sample', title: 'Manager', copies: 1}],
    }};
    const original = JSON.stringify(configuration);
    const plan = await renderProduction(canvas, configuration, 0, null, {artworkOnly: true, pixelsPerInch: 1200});
    assert.equal(canvas.width, 3600); assert.equal(canvas.height, 2400);
    assert.ok(calls.some(call => call[0] === 'scale' && call[1] === 4 && call[2] === 4));
    assert.equal(calls.filter(call => call[0] === 'fillText').length, 2);
    for (const forbidden of ['drawImage', 'fillRect', 'stroke', 'translate', 'createLinearGradient']) assert.ok(!calls.some(call => call[0] === forbidden), forbidden);
    assert.equal(plan.radius, family === 'standard' ? 24 : 37.5);
    assert.equal(JSON.stringify(configuration), original);
  }
});
