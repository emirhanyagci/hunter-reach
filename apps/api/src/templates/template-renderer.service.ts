import { Injectable } from '@nestjs/common';
import * as Handlebars from 'handlebars';

// ── Turkish vowel harmony ──────────────────────────────────────────────────────

function hasTurkishChars(word: string): boolean {
  return /[ğışöüçİĞŞÖÜÇ]/i.test(word);
}

function getLastVowel(word: string): string | null {
  const lower = word.toLowerCase();
  // English words ending in 'ay' (e.g. Codeway, eBay, Subway) are pronounced
  // with a front vowel sound /eɪ/ in Turkish → treat as front vowel 'e'
  if (lower.endsWith('ay') && !hasTurkishChars(word)) return 'e';

  const vowels = 'aeıioöuü';
  for (let i = lower.length - 1; i >= 0; i--) {
    if (vowels.includes(lower[i])) return lower[i];
  }
  return null;
}

function endsWithVoicelessConsonant(word: string): boolean {
  // 'x' = /ks/ in English (Netflix, Dropbox, FedEx) → voiceless
  return new Set(['ç', 'f', 'h', 'k', 'p', 's', 'ş', 't', 'x']).has(
    word[word.length - 1].toLowerCase(),
  );
}

export function applyTurkishSuffix(word: string, hint: string): string {
  if (!word) return '';
  const lastVowel = getLastVowel(word);
  if (!lastVowel) return `${word}'${hint}`;

  const isBack = new Set(['a', 'ı', 'o', 'u']).has(lastVowel);
  const isVoiceless = endsWithVoicelessConsonant(word);
  const endsWithVowel = 'aeıioöuü'.includes(word[word.length - 1].toLowerCase());
  const h = hint.toLowerCase();

  // Locative: -de/-da/-te/-ta
  if (['de', 'da', 'te', 'ta'].includes(h)) {
    return `${word}'${isVoiceless ? (isBack ? 'ta' : 'te') : (isBack ? 'da' : 'de')}`;
  }

  // Ablative: -den/-dan/-ten/-tan
  if (['den', 'dan', 'ten', 'tan'].includes(h)) {
    return `${word}'${isVoiceless ? (isBack ? 'tan' : 'ten') : (isBack ? 'dan' : 'den')}`;
  }

  // Dative: -e/-a/-ye/-ya
  if (['e', 'a', 'ye', 'ya'].includes(h)) {
    if (endsWithVowel) return `${word}'${isBack ? 'ya' : 'ye'}`;
    return `${word}'${isBack ? 'a' : 'e'}`;
  }

  // Genitive: -nin/-nın/-nun/-nün/-in/-ın/-un/-ün
  if (['nin', 'nın', 'nun', 'nün', 'in', 'ın', 'un', 'ün'].includes(h)) {
    const genSuffix: Record<string, string> = { a: 'nın', ı: 'nın', o: 'nun', u: 'nun', e: 'nin', i: 'nin', ö: 'nün', ü: 'nün' };
    const full = genSuffix[lastVowel] ?? 'nin';
    return `${word}'${endsWithVowel ? full : full.slice(1)}`;
  }

  return `${word}'${hint}`;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class TemplateRendererService {
  constructor() {
    Handlebars.registerHelper('fallback', (value: unknown, fallback: string) => {
      return value != null && value !== '' ? value : fallback;
    });

    Handlebars.registerHelper('ekle', (value: unknown, hint: unknown) => {
      const word = typeof value === 'string' ? value : String(value ?? '');
      const suffix = typeof hint === 'string' ? hint : 'de';
      return applyTurkishSuffix(word, suffix);
    });
  }

  render(template: string, data: Record<string, unknown>): string {
    const ctx = { ...data, ...(typeof data.extraFields === 'object' ? (data.extraFields as object) : {}) };
    const compiled = Handlebars.compile(template, { noEscape: false });
    return compiled(ctx);
  }

  extractVariables(template: string): string[] {
    try {
      const ast = Handlebars.parse(template);
      const vars = new Set<string>();
      const SKIP_HELPERS = new Set(['fallback', 'ekle']);
      const walk = (nodes: hbs.AST.Statement[]) => {
        for (const node of nodes) {
          if (node.type === 'MustacheStatement') {
            const mnode = node as hbs.AST.MustacheStatement;
            const path = mnode.path as hbs.AST.PathExpression;
            if (!SKIP_HELPERS.has(path.original)) {
              vars.add(path.original);
            } else if (path.original === 'ekle' && mnode.params?.length > 0) {
              // Extract the variable passed as first arg: {{ekle company "de"}}
              const firstParam = mnode.params[0];
              if (firstParam.type === 'PathExpression') {
                vars.add((firstParam as hbs.AST.PathExpression).original);
              }
            }
          }
          if ('body' in node) walk((node as any).body);
          if ('program' in node) walk((node as hbs.AST.BlockStatement).program.body);
        }
      };
      walk(ast.body);
      return [...vars];
    } catch {
      return [];
    }
  }
}
