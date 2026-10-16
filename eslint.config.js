// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },

  // กฎสถาปัตยกรรมข้อ 3: กติกาเป็นโค้ดบริสุทธิ์
  {
    files: ['packages/games/*/rules/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['socket.io*', 'fastify*', '@fastify/*', 'react', 'react-*', 'next', 'next/*'],
              message: 'โค้ดกติกาต้องบริสุทธิ์ ห้าม import socket, fastify หรือ React',
            },
            {
              group: ['drizzle-orm*', 'pg', 'postgres', 'redis', 'ioredis'],
              message: 'โค้ดกติกาต้องบริสุทธิ์ ห้ามแตะ DB',
            },
            {
              group: ['node:*', 'fs', 'path', 'crypto'],
              message: 'โค้ดกติกาต้องบริสุทธิ์ ห้ามใช้ Node API',
            },
            {
              group: ['../client/**', '../client'],
              message: 'กติกาห้าม import โค้ดหน้าจอ',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'ใช้ rng ที่ถูกส่งเข้ามาแทน' },
        { object: 'Date', property: 'now', message: 'ใช้ now ที่ถูกส่งเข้ามาแทน' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'ใช้ now ที่ถูกส่งเข้ามาแทน new Date()',
        },
      ],
    },
  },

  // กฎสถาปัตยกรรมข้อ 4: แพลตฟอร์มไม่รู้จักกติกาเกม
  {
    files: ['packages/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@batonboard/spyfall*'],
              message: 'engine ห้ามรู้จักเกมใดเกมหนึ่ง',
            },
          ],
        },
      ],
    },
  },

  prettier,
);
