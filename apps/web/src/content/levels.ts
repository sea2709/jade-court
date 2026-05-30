import type { Difficulty } from '@jade-court/xiangqi-engine';

export interface LevelMeta {
  id: Difficulty;
  name: string;
  zh: string;
  glyph: string;
  accent: string;
  desc: string;
  stars: number;
}

export const LEVELS: LevelMeta[] = [
  {
    id: 'beginner',
    name: 'Beginner',
    zh: '初級',
    glyph: '卒',
    accent: 'linear-gradient(150deg,#2BB495,#157A63)',
    desc: 'Casual moves, forgiving. Great for your first wins.',
    stars: 1,
  },
  {
    id: 'intermediate',
    name: 'Intermediate',
    zh: '中級',
    glyph: '馬',
    accent: 'linear-gradient(150deg,#EBB24B,#C98C1F)',
    desc: 'Looks two moves ahead and punishes loose play.',
    stars: 2,
  },
  {
    id: 'advanced',
    name: 'Advanced',
    zh: '高級',
    glyph: '車',
    accent: 'linear-gradient(150deg,#E0573C,#AE3119)',
    desc: 'Calculates deeper and grabs every weakness.',
    stars: 3,
  },
];
