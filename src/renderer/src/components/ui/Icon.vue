<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name: string; size?: number | string }>(), {
  size: 18
})

type El =
  | { kind: 'path'; d: string }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'text'; text: string; x: number; y: number; size: number }

const ICONS: Record<string, El[]> = {
  search: [
    { kind: 'path', d: 'M10.6 3.2a7.4 7.4 0 1 0 0 14.8a7.4 7.4 0 0 0 0-14.8z' },
    { kind: 'path', d: 'M16.2 16.2L21 21' }
  ],
  plus: [{ kind: 'path', d: 'M12 5v14M5 12h14' }],
  'arrow-up': [{ kind: 'path', d: 'M12 19V5M5 12l7-7 7 7' }],
  minus: [{ kind: 'path', d: 'M5 12h14' }],
  settings: [
    {
      kind: 'path',
      d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'
    },
    { kind: 'circle', cx: 12, cy: 12, r: 3 }
  ],
  'chevron-down': [{ kind: 'path', d: 'M6 9l6 6 6-6' }],
  'chevron-left': [{ kind: 'path', d: 'M15 6l-6 6 6 6' }],
  'chevron-right': [{ kind: 'path', d: 'M9 6l6 6-6 6' }],
  'arrow-left': [{ kind: 'path', d: 'M19 12H5M12 19l-7-7 7-7' }],
  x: [{ kind: 'path', d: 'M18 6L6 18M6 6l12 12' }],
  check: [{ kind: 'path', d: 'M20 6L9 17l-5-5' }],
  bold: [
    { kind: 'path', d: 'M6 4h8a4 4 0 0 1 0 8H6z' },
    { kind: 'path', d: 'M6 12h9a4 4 0 0 1 0 8H6z' }
  ],
  italic: [{ kind: 'path', d: 'M19 4h-9M14 20H5M15 4L9 20' }],
  underline: [{ kind: 'path', d: 'M6 4v6a6 6 0 0 0 12 0V4M4 20h16' }],
  strike: [
    { kind: 'path', d: 'M16 4H9a3 3 0 0 0-2.83 4' },
    { kind: 'path', d: 'M14 12a4 4 0 0 1 0 8H6' },
    { kind: 'path', d: 'M4 12h16' }
  ],
  h1: [{ kind: 'text', text: 'H1', x: 12, y: 16.2, size: 11 }],
  h2: [{ kind: 'text', text: 'H2', x: 12, y: 16.2, size: 11 }],
  h3: [{ kind: 'text', text: 'H3', x: 12, y: 16.2, size: 11 }],
  quote: [
    { kind: 'path', d: 'M10 11H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v8a4 4 0 0 1-4 4' },
    { kind: 'path', d: 'M20 11h-4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v8a4 4 0 0 1-4 4' }
  ],
  bullet: [
    { kind: 'path', d: 'M9 6h12M9 12h12M9 18h12' },
    { kind: 'circle', cx: 4, cy: 6, r: 1 },
    { kind: 'circle', cx: 4, cy: 12, r: 1 },
    { kind: 'circle', cx: 4, cy: 18, r: 1 }
  ],
  ordered: [
    { kind: 'path', d: 'M11 6h10M11 12h10M11 18h10' },
    { kind: 'text', text: '1', x: 4.5, y: 8.6, size: 10 },
    { kind: 'text', text: '2', x: 4.5, y: 14.6, size: 10 },
    { kind: 'text', text: '3', x: 4.5, y: 20.6, size: 10 }
  ],
  code: [{ kind: 'path', d: 'M16 18l6-6-6-6M8 6l-6 6 6 6' }],
  alignLeft: [{ kind: 'path', d: 'M21 6H3M15 12H3M17 18H3' }],
  alignCenter: [{ kind: 'path', d: 'M3 6h18M9 12h6M5 18h14' }],
  alignRight: [{ kind: 'path', d: 'M3 6h18M9 12h12M7 18h14' }],
  image: [
    { kind: 'path', d: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { kind: 'circle', cx: 9, cy: 9, r: 2 },
    { kind: 'path', d: 'M21 15l-4.35-4.35a1.2 1.2 0 0 0-1.7 0L5 21' }
  ],
  divider: [{ kind: 'path', d: 'M5 12h14' }],
  undo: [{ kind: 'path', d: 'M3 7v6h6M21 17a9 9 0 0 0-15-6.7L3 13' }],
  redo: [{ kind: 'path', d: 'M21 7v6h-6M3 17a9 9 0 0 1 15-6.7L21 13' }],
  trash: [
    { kind: 'path', d: 'M3 6h18' },
    { kind: 'path', d: 'M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2' },
    { kind: 'path', d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' }
  ],
  copy: [
    { kind: 'path', d: 'M9 9h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z' },
    { kind: 'path', d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }
  ],
  selectAll: [
    { kind: 'path', d: 'M8 3H5a2 2 0 0 0-2 2v3' },
    { kind: 'path', d: 'M16 3h3a2 2 0 0 1 2 2v3' },
    { kind: 'path', d: 'M21 16v3a2 2 0 0 1-2 2h-3' },
    { kind: 'path', d: 'M8 21H5a2 2 0 0 0-2-2v-3' },
    { kind: 'path', d: 'M8.5 12l2.5 2.5 4.5-4.5' }
  ],
  move: [
    { kind: 'path', d: 'M5 9l-3 3 3 3' },
    { kind: 'path', d: 'M9 5l3-3 3 3' },
    { kind: 'path', d: 'M15 19l-3 3-3-3' },
    { kind: 'path', d: 'M19 9l3 3-3 3' },
    { kind: 'path', d: 'M2 12h20M12 2v20' }
  ],
  more: [
    { kind: 'circle', cx: 5, cy: 12, r: 1.1 },
    { kind: 'circle', cx: 12, cy: 12, r: 1.1 },
    { kind: 'circle', cx: 19, cy: 12, r: 1.1 }
  ],
  folder: [
    {
      kind: 'path',
      d: 'M4 5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-9l-2-2z'
    }
  ],
  sun: [
    { kind: 'circle', cx: 12, cy: 12, r: 4 },
    { kind: 'path', d: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41' }
  ],
  moon: [{ kind: 'path', d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' }],
  monitor: [
    { kind: 'path', d: 'M2 4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z' },
    { kind: 'path', d: 'M8 21h8M12 16v5' }
  ],
  sparkles: [
    {
      kind: 'path',
      d: 'M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z'
    },
    { kind: 'path', d: 'M19 3v3M17.5 4.5h3' }
  ],
  book: [
    { kind: 'path', d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' },
    { kind: 'path', d: 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' }
  ],
  note: [
    { kind: 'path', d: 'M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z' },
    { kind: 'path', d: 'M15 3v6h6' }
  ],
  minimize: [{ kind: 'path', d: 'M5 12h14' }],
  maximize: [
    { kind: 'path', d: 'M8 3H5a2 2 0 0 0-2 2v3' },
    { kind: 'path', d: 'M16 3h3a2 2 0 0 1 2 2v3' },
    { kind: 'path', d: 'M21 16v3a2 2 0 0 1-2 2h-3' },
    { kind: 'path', d: 'M3 16v3a2 2 0 0 0 2 2h3' }
  ],
  restore: [
    { kind: 'path', d: 'M4 14V6a2 2 0 0 1 2-2h8' },
    { kind: 'path', d: 'M20 10v8a2 2 0 0 1-2 2h-8' },
    { kind: 'path', d: 'M9 4h8a2 2 0 0 1 2 2v8' },
    { kind: 'path', d: 'M15 20h-8a2 2 0 0 1-2-2v-8' }
  ],
  warning: [
    { kind: 'path', d: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' },
    { kind: 'path', d: 'M12 9v4M12 17h.01' }
  ],
  eye: [
    { kind: 'path', d: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z' },
    { kind: 'circle', cx: 12, cy: 12, r: 3 }
  ],
  external: [
    { kind: 'path', d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' },
    { kind: 'path', d: 'M15 3h6v6M10 14L21 3' }
  ],
  refresh: [
    { kind: 'path', d: 'M21 12a9 9 0 1 1-2.64-6.36L21 8' },
    { kind: 'path', d: 'M21 3v5h-5' }
  ],
  stop: [{ kind: 'path', d: 'M7 7h10v10H7z' }],
  globe: [
    { kind: 'circle', cx: 12, cy: 12, r: 9 },
    { kind: 'path', d: 'M2 12h20' },
    { kind: 'path', d: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' }
  ],
  pencil: [{ kind: 'path', d: 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z' }],
  palette: [
    {
      kind: 'path',
      d: 'M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1.1.9-2 2-2h2.5A5.5 5.5 0 0 0 23 10c0-4.4-4.9-8-11-8z'
    },
    { kind: 'circle', cx: 7.5, cy: 11.5, r: 1 },
    { kind: 'circle', cx: 11, cy: 7, r: 1 },
    { kind: 'circle', cx: 16, cy: 8, r: 1 }
  ],
  type: [{ kind: 'path', d: 'M4 7V4h16v3M9 20h6M12 4v16' }],
  storage: [
    { kind: 'path', d: 'M22 12H2' },
    {
      kind: 'path',
      d: 'M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'
    },
    { kind: 'path', d: 'M6 16h.01M10 16h.01' }
  ],
  info: [
    { kind: 'circle', cx: 12, cy: 12, r: 9 },
    { kind: 'path', d: 'M12 16v-4M12 8h.01' }
  ],
  listCheck: [
    { kind: 'path', d: 'M3 17l2 2 4-4' },
    { kind: 'path', d: 'M3 7l2 2 4-4' },
    { kind: 'path', d: 'M13 6h8M13 12h8M13 18h8' }
  ],
  clock: [
    { kind: 'circle', cx: 12, cy: 12, r: 9 },
    { kind: 'path', d: 'M12 6v6l4 2' }
  ],
  bot: [
    { kind: 'path', d: 'M12 3v3' },
    { kind: 'path', d: 'M9 20v-2a3 3 0 0 1 6 0v2' },
    { kind: 'path', d: 'M6 21h12' },
    { kind: 'path', d: 'M4 6h16a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z' },
    { kind: 'circle', cx: 9, cy: 11, r: 1 },
    { kind: 'circle', cx: 15, cy: 11, r: 1 }
  ],
  key: [
    { kind: 'circle', cx: 8, cy: 15, r: 4 },
    { kind: 'path', d: 'M11 12L21 2M17 6l3 3' }
  ],
  zoom: [
    { kind: 'circle', cx: 11, cy: 11, r: 7 },
    { kind: 'path', d: 'M21 21l-4.35-4.35M8 11h6M11 8v6' }
  ]
}

const els = computed(() => ICONS[props.name] ?? ICONS.info)
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-for="(el, i) in els" :key="i">
      <path v-if="el.kind === 'path'" :d="el.d" />
      <circle v-else-if="el.kind === 'circle'" :cx="el.cx" :cy="el.cy" :r="el.r" fill="currentColor" stroke="none" />
      <text
        v-else
        :x="el.x"
        :y="el.y"
        text-anchor="middle"
        :font-size="el.size"
        font-weight="700"
        stroke="none"
        fill="currentColor"
        font-family="Georgia, serif"
      >
        {{ el.text }}
      </text>
    </template>
  </svg>
</template>
