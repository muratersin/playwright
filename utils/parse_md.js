/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

function normalizeLines(content) {
  const inLines = content.replace(/\r\n/g, '\n').split('\n');
  let inCodeBlock = false;
  const outLines = [];
  let outLineTokens = [];
  for (const line of inLines) {
    let singleLineExpression = line.startsWith('#');
    let flushParagraph = !line.trim()
      || line.trim().startsWith('1.')
      || line.trim().startsWith('<')
      || line.trim().startsWith('>')
      || line.trim().startsWith('-')
      || line.trim().startsWith('*')
      || singleLineExpression;
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      flushParagraph = true;
    }
    if (flushParagraph && outLineTokens.length) {
      outLines.push(outLineTokens.join(' '));
      outLineTokens = [];
    }
    const trimmedLine = line.trim();
    if (inCodeBlock || singleLineExpression)
      outLines.push(line);
    else if (trimmedLine)
      outLineTokens.push(trimmedLine.startsWith('-') ? line : trimmedLine);
  }
  if (outLineTokens.length)
    outLines.push(outLineTokens.join(' '));
  return outLines;
}

function buildTree(lines) {
  const root = {
    type: 'h0',
    value: '<root>',
    children: []
  };
  const stack = [root];
  let liStack = null;

  for (let i = 0; i < lines.length; ++i) {
    let line = lines[i];

    if (line.startsWith('```')) {
      const node = {
        type: 'code',
        lines: [],
        codeLang: line.substring(3)
      };
      stack[0].children.push(node);
      line = lines[++i];
      while (!line.startsWith('```')) {
        node.lines.push(line);
        line = lines[++i];
      }
      continue;
    }

    if (line.startsWith('<!-- GEN')) {
      const node = {
        type: 'gen',
        lines: [line]
      };
      stack[0].children.push(node);
      line = lines[++i];
      while (!line.startsWith('<!-- GEN')) {
        node.lines.push(line);
        line = lines[++i];
      }
      node.lines.push(line);
      continue;
    }

    const header = line.match(/^(#+)/);
    if (header) {
      const node = { children: [] };
      const h = header[1].length;
      node.type = 'h' + h;
      node.text = line.substring(h + 1);

      while (true) {
        const lastH = +stack[0].type.substring(1);
        if (h <= lastH)
          stack.shift();
        else
          break;
      }
      stack[0].children.push(node);
      stack.unshift(node);
      liStack = [node];
      continue;
    }

    const list = line.match(/^(\s*)(-|1.|\*) /);
    const depth = list ? (list[1].length / 2) : 0;
    const node = {};
    if (list) {
      node.type = 'li';
      node.text = line.substring(list[0].length);
      if (line.trim().startsWith('1.'))
        node.liType = 'ordinal';
      else if (line.trim().startsWith('*'))
        node.liType = 'bullet';
      else 
        node.liType = 'default';
    } else {
      node.type = 'text';
      node.text = line;
    }
    if (!liStack[depth].children)
      liStack[depth].children = [];
    liStack[depth].children.push(node);
    liStack[depth + 1] = node;
  }
  return root.children;
}

function parseMd(content) {
  return buildTree(normalizeLines(content));
}

function renderMd(nodes, maxColumns) {
  const result = [];
  let lastNode;
  for (let node of nodes) {
    innerRenderMdNode(node, lastNode, result, maxColumns);
    lastNode = node;
  }
  return result.join('\n');
}

function innerRenderMdNode(node, lastNode, result, maxColumns = 120) {
  const newLine = () => {
    if (result[result.length - 1] !== '')
      result.push('');
  };

  if (node.type.startsWith('h')) {
    newLine();
    const depth = node.type.substring(1);
    result.push(`${'#'.repeat(depth)} ${node.text}`);
    let lastNode = node;
    for (const child of node.children || []) {
      innerRenderMdNode(child, lastNode, result, maxColumns);
      lastNode = child;
    }
  }

  if (node.type === 'text') {
    const bothComments = node.text.startsWith('>') && lastNode && lastNode.type === 'text' && lastNode.text.startsWith('>');
    if (!bothComments && lastNode && lastNode.text)
      newLine();
      printText(node, result, maxColumns);
  }

  if (node.type === 'code') {
    newLine();
    result.push('```' + node.codeLang);
    for (const line of node.lines)
      result.push(line);
    result.push('```');
    newLine();
  }

  if (node.type === 'gen') {
    newLine();
    for (const line of node.lines)
      result.push(line);
    newLine();
  }

  if (node.type === 'li') {
    const visit = (node, indent) => {
      let char;
      switch (node.liType) {
        case 'bullet': char = '*'; break;
        case 'default': char = '-'; break;
        case 'ordinal': char = '1.'; break;
      }
      result.push(`${indent}${char} ${node.text}`);
      for (const child of node.children || [])
        visit(child, indent + '  ');
    };
    visit(node, '');
  }
}

function printText(node, result, maxColumns) {
  let line = node.text;
  while (line.length > maxColumns) {
    let index = line.lastIndexOf(' ', maxColumns);
    if (index === -1) {
      index = line.indexOf(' ', maxColumns);
      if (index === -1)
        break;
    }
    result.push(line.substring(0, index));
    line = line.substring(index + 1);
  }
  if (line.length)
    result.push(line);
}

function clone(node) {
  const copy = { ...node };
  copy.children = copy.children ? copy.children.map(c => clone(c)) : undefined;
  return copy;
}

function applyTemplates(body, params) {
  const paramsMap = new Map();
  for (const node of params)
    paramsMap.set('%%-' + node.text + '-%%', node);

  const visit = (node, parent) => {
    if (node.text && node.text.includes('-inline- = %%')) {
      const [name, key] = node.text.split('-inline- = ');
      const list = paramsMap.get(key);
      if (!list)
        throw new Error('Bad template: ' + key);
      for (const prop of list.children) {
        const template = paramsMap.get(prop.text);
        if (!template)
          throw new Error('Bad template: ' + prop.text);
        const { name: argName } = parseArgument(template.children[0].text);
        parent.children.push({
          type: node.type,
          text: name + argName,
          children: template.children.map(c => clone(c))
        });
      }
    } else if (node.text && node.text.includes(' = %%')) {
      const [name, key] = node.text.split(' = ');
      node.text = name;
      const template = paramsMap.get(key);
      if (!template)
        throw new Error('Bad template: ' + key);
      node.children.push(...template.children.map(c => clone(c)));
    }
    for (const child of node.children || [])
      visit(child, node);
    if (node.children)
      node.children = node.children.filter(child => !child.text || !child.text.includes('-inline- = %%'));
  };

  for (const node of body)
    visit(node, null);

  return body;
}

/**
 * @param {string} line 
 * @returns {{ name: string, type: string, text: string }}
 */
function parseArgument(line) {
  let match = line.match(/^`([^`]+)` (.*)/);
  if (!match)
    match = line.match(/^(returns): (.*)/);
  if (!match)
    match = line.match(/^(type): (.*)/);
  if (!match)
    throw new Error('Invalid argument: ' + line);
  const name = match[1];
  const remainder = match[2];
  if (!remainder.startsWith('<'))
    throw new Error('Bad argument: ' + remainder);
  let depth = 0;
  for (let i = 0; i < remainder.length; ++i) {
    const c = remainder.charAt(i);
    if (c === '<')
      ++depth;
    if (c === '>')
      --depth;
    if (depth === 0)
      return { name, type: remainder.substring(1, i), text: remainder.substring(i + 2) };
  }
  throw new Error('Should not be reached');
}

module.exports = { parseMd, renderMd, parseArgument, applyTemplates, clone };
