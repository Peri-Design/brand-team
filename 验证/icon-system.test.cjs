'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');

test('界面图标使用统一 SVG symbol 与尺寸线宽变量', () => {
  assert.match(css, /--icon-stroke:1\.75/);
  assert.match(css, /--icon-size:18px/);
  assert.match(css, /--icon-size-small:16px/);
  assert.match(css, /--icon-size-nav:22px/);
  assert.match(css, /stroke-linecap:round;stroke-linejoin:round/);
  for (const id of ['undo', 'redo', 'hand', 'minus', 'plus', 'close', 'download', 'more']) {
    assert.match(html, new RegExp(`id="i-${id}"`));
  }
});

test('带外框的功能图标统一使用相同圆角', () => {
  const sprite = html.match(/<svg class="icon-defs"[\s\S]*?<\/svg>/)?.[0] || '';
  const rectangles = [...sprite.matchAll(/<rect\b[^>]*>/g)].map(match => match[0]);
  assert.ok(rectangles.length > 0);
  for (const rectangle of rectangles) assert.match(rectangle, /rx="2"/);
});

test('可见界面不再用文本符号或临时内联路径充当图标', () => {
  assert.doesNotMatch(html, /<button[^>]*>\s*(?:↶|↷|×|−|＋)/);
  const withoutSprite = html.replace(/<svg class="icon-defs"[\s\S]*?<\/svg>/, '');
  const icons = [...withoutSprite.matchAll(/<svg\b[^>]*>([\s\S]*?)<\/svg>/g)];
  assert.ok(icons.length > 0);
  for (const [, body] of icons) {
    assert.match(body, /<use href="#i-[^"]+"\s*\/>/);
    assert.doesNotMatch(body, /<(?:path|circle|rect|polygon|line)\b/);
  }
  assert.doesNotMatch(app, /<svg[^>]*>[\s\S]*?<(?:path|circle|rect|polygon|line)\b/);
});

test('品牌素材页移除来源脚注并统一下载操作图标', () => {
  assert.doesNotMatch(html, /来源：PixVerse Logo/);
  assert.doesNotMatch(html, /来源：爱诗科技官方 Logo/);
  const downloads = [...html.matchAll(/<a class="secondary"[^>]+download=[^>]+>([\s\S]*?)<\/a>/g)];
  assert.equal(downloads.length, 12);
  for (const [, content] of downloads) assert.match(content, /href="#i-download"/);
});
