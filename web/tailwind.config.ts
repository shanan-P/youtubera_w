// This is the configuration file for Tailwind CSS.
// It contains settings for the application, such as theme colors, fonts, and plugins.
import type { Config } from "tailwindcss";
import { themes } from "./app/styles/theme";

const { fontFamily } = require("tailwindcss/defaultTheme");

function toCssVariables(theme: Record<string, string>) {
  const variables: Record<string, string> = {};
  for (const [key, value] of Object.entries(theme)) {
    variables[`--color-${key}`] = value;
  }
  return variables;
}


export default {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Gilroy-Light", "Gilroy-ExtraBold", "Inter", ...fontFamily.sans],
        serif: ["Lora", ...fontFamily.serif],
      },
      colors: {
        paper: 'var(--color-paper)',
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        'main-text': 'var(--color-main-text)',
        'sub-text': 'var(--color-sub-text)',
        'subtle-text': 'var(--color-subtle-text)',
        'button-text': 'var(--color-button-text)',
        'main-border': 'var(--color-main-border)',
        'subtle-border': 'var(--color-subtle-border)',
        'main-bg': 'var(--color-main-bg)',
        'subtle-bg': 'var(--color-subtle-bg)',
        'highlight-bg': 'var(--color-highlight-bg)',
        'main-accent': 'var(--color-main-accent)',
        'subtle-accent': 'var(--color-subtle-accent)',
        'error-text': 'var(--color-error-text)',
        'error-bg': 'var(--color-error-bg)',
        'error-border': 'var(--color-error-border)',
        'success-text': 'var(--color-success-text)',
        'success-bg': 'var(--color-success-bg)',
        'success-border': 'var(--color-success-border)',
        'info-text': 'var(--color-info-text)',
        'info-bg': 'var(--color-info-bg)',
        'info-border': 'var(--color-info-border)',
        'warn-text': 'var(--color-warn-text)',
        'warn-bg': 'var(--color-warn-bg)',
        'warn-border': 'var(--color-warn-border)',
        },
      typography: ({ theme }: { theme: any }) => ({
        DEFAULT: {
            css: {
                '--tw-prose-body': 'var(--color-main-text)',
                '--tw-prose-headings': 'var(--color-primary)',
                '--tw-prose-lead': 'var(--color-sub-text)',
                '--tw-prose-links': 'var(--color-main-accent)',
                '--tw-prose-bold': 'var(--color-primary)',
                '--tw-prose-counters': 'var(--color-subtle-text)',
                '--tw-prose-bullets': 'var(--color-subtle-text)',
                '--tw-prose-hr': 'var(--color-subtle-border)',
                '--tw-prose-quotes': 'var(--color-primary)',
                '--tw-prose-quote-borders': 'var(--color-main-border)',
                '--tw-prose-captions': 'var(--color-subtle-text)',
                '--tw-prose-code': 'var(--color-primary)',
                '--tw-prose-pre-code': 'var(--color-button-text)',
                '--tw-prose-pre-bg': 'var(--color-secondary)',
                '--tw-prose-th-borders': 'var(--color-main-border)',
                '--tw-prose-td-borders': 'var(--color-subtle-border)',
                '--tw-prose-invert-body': 'var(--color-main-text)',
                '--tw-prose-invert-headings': 'var(--color-primary)',
                '--tw-prose-invert-lead': 'var(--color-sub-text)',
                '--tw-prose-invert-links': 'var(--color-main-accent)',
                '--tw-prose-invert-bold': 'var(--color-primary)',
                '--tw-prose-invert-counters': 'var(--color-subtle-text)',
                '--tw-prose-invert-bullets': 'var(--color-subtle-text)',
                '--tw-prose-invert-hr': 'var(--color-subtle-border)',
                '--tw-prose-invert-quotes': 'var(--color-primary)',
                '--tw-prose-invert-quote-borders': 'var(--color-main-border)',
                '--tw-prose-invert-captions': 'var(--color-subtle-text)',
                '--tw-prose-invert-code': 'var(--color-primary)',
                '--tw-prose-invert-pre-code': 'var(--color-button-text)',
                '--tw-prose-invert-pre-bg': 'var(--color-secondary)',
                '--tw-prose-invert-th-borders': 'var(--color-main-border)',
                '--tw-prose-invert-td-borders': 'var(--color-subtle-border)',
            },
        },
        sepia: {
            css: {
                '--tw-prose-body': 'var(--color-main-text)',
                '--tw-prose-headings': 'var(--color-primary)',
                '--tw-prose-lead': 'var(--color-sub-text)',
                '--tw-prose-links': 'var(--color-main-accent)',
                '--tw-prose-bold': 'var(--color-primary)',
                '--tw-prose-counters': 'var(--color-subtle-text)',
                '--tw-prose-bullets': 'var(--color-subtle-text)',
                '--tw-prose-hr': 'var(--color-subtle-border)',
                '--tw-prose-quotes': 'var(--color-primary)',
                '--tw-prose-quote-borders': 'var(--color-main-border)',
                '--tw-prose-captions': 'var(--color-subtle-text)',
                '--tw-prose-code': 'var(--color-primary)',
                '--tw-prose-pre-code': 'var(--color-button-text)',
                '--tw-prose-pre-bg': 'var(--color-secondary)',
                '--tw-prose-th-borders': 'var(--color-main-border)',
                '--tw-prose-td-borders': 'var(--color-subtle-border)',
                color: 'var(--tw-prose-body)',
                a: {
                    color: 'var(--tw-prose-links)',
                    textDecoration: 'none',
                    fontWeight: '600',
                    borderBottom: '1px solid',
                    borderColor: 'transparent',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                        color: 'var(--color-main-accent)',
                        borderColor: 'var(--color-subtle-accent)',
                        textDecoration: 'none',
                    },
                },
                'h1, h2, h3, h4, h5, h6': {
                    color: 'var(--tw-prose-headings)',
                    fontWeight: '700',
                    lineHeight: 1.25,
                    marginTop: '1.8em',
                    marginBottom: '0.8em',
                    fontFamily: theme('fontFamily.serif').join(', '),
                },
                h1: {
                    fontSize: 'calc(var(--font-scale, 1) * 2.5em)',
                    fontWeight: '800',
                    letterSpacing: '-0.02em',
                    borderBottom: '2px solid',
                    borderColor: 'var(--color-main-border)',
                    paddingBottom: '0.3em',
                },
                h2: {
                    fontSize: 'calc(var(--font-scale, 1) * 2em)',
                    fontWeight: '700',
                    letterSpacing: '-0.01em',
                    borderBottom: '1px solid',
                    borderColor: 'var(--color-main-border)',
                    paddingBottom: '0.2em',
                },
                h3: {
                    fontSize: 'calc(var(--font-scale, 1) * 1.6em)',
                    fontWeight: '700',
                },
                'p, ul, ol': {
                    marginTop: '1.4em',
                    marginBottom: '1.4em',
                    lineHeight: 1.75,
                    fontSize: 'calc(var(--font-scale, 1) * 1.1em)',
                    color: 'var(--color-main-text)',
                },
                'ul, ol': {
                    paddingLeft: '1.5em',
                },
                li: {
                    marginBottom: '0.5em',
                    '&:last-child': {
                        marginBottom: 0,
                    },
                },
                strong: {
                    color: 'var(--color-primary)',
                    fontWeight: '600',
                },
                code: {
                    backgroundColor: 'var(--color-subtle-bg)',
                    padding: '0.2em 0.4em',
                    borderRadius: '0.25rem',
                    fontSize: 'calc(var(--font-scale, 1) * 0.9em)',
                    fontWeight: 'normal',
                },
                pre: {
                    backgroundColor: 'var(--color-subtle-bg)',
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    overflowX: 'auto',
                    code: {
                        backgroundColor: 'transparent',
                        padding: 0,
                    },
                },
                blockquote: {
                    borderLeft: '4px solid var(--tw-prose-quote-borders)',
                    padding: '1em 1.5em',
                    fontStyle: 'normal',
                    color: 'var(--tw-prose-quotes)',
                    margin: '2em 0',
                    backgroundColor: 'var(--color-subtle-bg)',
                    borderRadius: '0.375rem',
                    borderLeftWidth: '0.5rem',
                    '> :first-child': {
                        marginTop: 0,
                    },
                    '> :last-child': {
                        marginBottom: 0,
                    },
                },
            },
        },
        reading: {
            css: {
                fontSize: 'calc(var(--font-scale, 1) * 1.125em)',
                lineHeight: '1.75',
                p: { marginTop: '1.25em', marginBottom: '1.25em' },
                'h1, h2, h3, h4, h5, h6': { marginTop: '1.5em', marginBottom: '0.5em', lineHeight: '1.2' },
                h1: { fontSize: 'calc(var(--font-scale, 1) * 2.5em)', fontWeight: '600' },
                h2: { fontSize: 'calc(var(--font-scale, 1) * 2em)', fontWeight: '600' },
                h3: { fontSize: 'calc(var(--font-scale, 1) * 1.75em)', fontWeight: '600' },
                'ul, ol': { marginTop: '1.5em', marginBottom: '1.5em' },
                li: { marginTop: '0.5em', marginBottom: '0.5em' },
                '--tw-prose-body': 'var(--color-main-text)',
                '--tw-prose-headings': 'var(--color-primary)',
                '--tw-prose-lead': 'var(--color-sub-text)',
                '--tw-prose-links': 'var(--color-main-accent)',
                '--tw-prose-bold': 'var(--color-primary)',
                '--tw-prose-counters': 'var(--color-subtle-text)',
                '--tw-prose-bullets': 'var(--color-subtle-text)',
                '--tw-prose-hr': 'var(--color-subtle-border)',
                '--tw-prose-quotes': 'var(--color-primary)',
                '--tw-prose-quote-borders': 'var(--color-main-border)',
                '--tw-prose-captions': 'var(--color-subtle-text)',
                '--tw-prose-code': 'var(--color-primary)',
                '--tw-prose-pre-code': 'var(--color-button-text)',
                '--tw-prose-pre-bg': 'var(--color-secondary)',
                '--tw-prose-th-borders': 'var(--color-main-border)',
                '--tw-prose-td-borders': 'var(--color-subtle-border)',
                '--tw-prose-invert-body': 'var(--color-main-text)',
                '--tw-prose-invert-headings': 'var(--color-primary)',
                '--tw-prose-invert-lead': 'var(--color-sub-text)',
                '--tw-prose-invert-links': 'var(--color-main-accent)',
                '--tw-prose-invert-bold': 'var(--color-primary)',
                '--tw-prose-invert-counters': 'var(--color-subtle-text)',
                '--tw-prose-invert-bullets': 'var(--color-subtle-text)',
                '--tw-prose-invert-hr': 'var(--color-subtle-border)',
                '--tw-prose-invert-quotes': 'var(--color-primary)',
                '--tw-prose-invert-quote-borders': 'var(--color-main-border)',
                '--tw-prose-invert-captions': 'var(--color-subtle-text)',
                '--tw-prose-invert-code': 'var(--color-primary)',
                '--tw-prose-invert-pre-code': 'var(--color-button-text)',
                '--tw-prose-invert-pre-bg': 'var(--color-secondary)',
                '--tw-prose-invert-th-borders': 'var(--color-main-border)',
                '--tw-prose-invert-td-borders': 'var(--color-subtle-border)',
                fontFamily: theme('fontFamily.serif').join(', '),
            },
        },
      }),
    },
  },
  plugins: [
    require("@tailwindcss/typography"),
    require('tailwindcss/plugin')(function({ addBase }: { addBase: (styles: Record<string, any>) => void }) {
        addBase({
            ':root': toCssVariables(themes.light),
            '.dark': toCssVariables(themes.dark),
            '.sepia': toCssVariables(themes.sepia),
        });
    }),
    require('tailwindcss/plugin')(function({ addVariant }: { addVariant: (name: string, definition: string) => void }) {
      addVariant('sepia', '.sepia &');
    })
  ],
} satisfies Config;