#!/usr/bin/env node
/* eslint-disable no-console */
/* eslint-disable no-process-exit */
import { readdir } from 'fs/promises';
import { join } from 'path';

async function generateTree(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const tree = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isLastEntry = i === entries.length - 1;
    const connector = isLastEntry ? '└── ' : '├── ';
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      const subTree = await generateTree(
        fullPath,
        prefix + (isLastEntry ? '    ' : '│   ')
      );
      tree.push(prefix + connector + entry.name + '/');
      tree.push(...subTree);
    } else {
      tree.push(prefix + connector + entry.name);
    }
  }

  return tree;
}

// Get directory from command line args or use current directory
const targetDir = process.argv[2] || '.';

generateTree(targetDir)
  .then(tree => {
    console.log(tree.join('\n'));
  })
  .catch(error => {
    console.error('Error generating tree:', error);
    process.exit(1);
  });
