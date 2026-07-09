import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import eslint from '@eslint/js';
import simpleImportSort from "eslint-plugin-simple-import-sort";
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';

module.exports = tseslint.config(
    // Any other config imports go at the top
    eslintPluginPrettierRecommended,
    eslint.configs.recommended,
    {
        rules: {
            "brace-style": "off",
            curly: "warn",
            "eol-last": "warn",
            eqeqeq: ["warn", "smart"],
            "id-denylist": [
                "warn",
                "any",
                "Number",
                "number",
                "String",
                "string",
                "Boolean",
                "boolean",
                // 'Undefined',
                "undefined"
            ],
            indent: "off",
            "no-multiple-empty-lines": [
                "warn",
                {
                    max: 1
                }
            ],
            "no-unused-vars": "off",
            "padding-line-between-statements": [
                "warn",
                {
                    blankLine: "always", next: "*", prev: ["import", "export"]
                },
                {
                    blankLine: "any", next: ["import", "export"], prev: ["import", "export"],
                },
                {
                    blankLine: "always", next: ["const", "let", "var"], prev: ["*"],
                },
                {
                    blankLine: "always", next: "*", prev: ["const", "let", "var"],
                },
                {
                    blankLine: "any", next: ["const", "let", "var"], prev: ["const", "let", "var"],
                },
                {
                    blankLine: "always", next: ["block", "class", "do", "function", "if", "switch", "try", "while", "with"], prev: ["*"],
                },
                {
                    blankLine: "always", next: "*", prev: ["block", "class", "do", "function", "if", "switch", "try", "while", "with"],
                },
                {
                    blankLine: "always", next: "return", prev: ["*"],
                },
            ],
            "prettier/prettier": "warn",
            quotes: ["warn", "double", { "avoidEscape": true }],
            "simple-import-sort/imports": "warn",
            "simple-import-sort/exports": "warn",
            "spaced-comment": [
                "warn",
                "always",
                {
                    markers: ["/"]
                }
            ]
        }
    },
    tseslint.configs.recommended,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: __dirname,
            },
        },
        rules: {
            "@typescript-eslint/consistent-type-assertions": "warn",
            "@typescript-eslint/indent": "off",
            "@typescript-eslint/naming-convention": "off",
            "@typescript-eslint/no-empty-function": "warn",
            "@typescript-eslint/no-for-in-array": "off",
            // Temporarily disabling due to build issues; re-enable as needed
            "@typescript-eslint/no-misused-promises": "off",
            "@typescript-eslint/no-namespace": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-return": "off",
            "@typescript-eslint/no-unused-expressions": "off",
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
            "@typescript-eslint/no-non-null-assertion": "off",
            "@typescript-eslint/no-var-requires": "off",
            "@typescript-eslint/prefer-namespace-keyword": "warn",
            "@typescript-eslint/unbound-method": "off",
        }
    },
    {
        ignores: [
            "node_modules/",
            "**/node_modules/**",
            "**/*.md",
            "**/*.json",
            "**/*.js",
            "**/*d.ts",
            "packages/server/src/public/",
            "packages/server/src/exampleResponse/"
        ]
    },
    {
        files: ['**/*.js'],
        extends: [tseslint.configs.disableTypeChecked],
    },
    {
        plugins: {
            '@stylistic': stylistic
        },
        rules: {
            "@stylistic/member-delimiter-style": [
                "warn",
                {
                    multiline: {
                        delimiter: "semi",
                        requireLast: true
                    },
                    singleline: {
                        delimiter: "semi",
                        requireLast: false
                    }
                }
            ],
            "@stylistic/semi": ["warn", "always"],
            "@stylistic/type-annotation-spacing": "warn",
        }
    },
    {
        plugins: {
            "simple-import-sort": simpleImportSort,
        },
        rules: {
            "simple-import-sort/imports": "error",
            "simple-import-sort/exports": "error",
        },
    },
)