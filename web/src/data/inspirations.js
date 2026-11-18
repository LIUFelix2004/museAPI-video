/**
 * 灵感库：融合自 Awesome-muse-video-prompts-and-skills
 * https://github.com/imagineVid/Awesome-muse-video-prompts-and-skills
 *
 * 提示词保留英文原文（Muse Video 是英文模型，原文效果最稳），标题与说明中文。
 * 每个案例都来自真实产出，不是臆造。
 */

/* ---------------- 场景卡片（空状态顶部） ---------------- */
export const SCENES = [
  {
    id: 'all',
    title: '全部灵感',
    desc: '按需挑选，直接套用',
    grad: 'from-emerald-500/25 to-teal-700/10',
  },
  {
    id: 'story',
    title: '剧情短片',
    desc: '分镜、运镜、成片一条龙',
    grad: 'from-sky-500/25 to-blue-700/10',
  },
  {
    id: 'commercial',
    title: '产品广告',
    desc: '商业节拍、产品运动',
    grad: 'from-violet-500/25 to-indigo-700/10',
  },
  {
    id: 'motion',
    title: '物理与动画',
    desc: '动作、重力、主体连续性',
    grad: 'from-amber-500/25 to-orange-700/10',
  },
  {
    id: 'pov',
    title: '沉浸视角',
    desc: '第一人称、镜头语言',
    grad: 'from-rose-500/25 to-pink-700/10',
  },
];

/* ---------------- 镜头简报公式 ---------------- */
export const FORMULA = {
  pattern: '[DURATION + ASPECT RATIO]. [SUBJECT] performs [VISIBLE ACTION] in [SETTING]. Camera: [FRAMING + MOVE]. Beats: [TIMED ACTIONS]. Audio: [DIALOGUE + FOLEY + AMBIENCE]. Preserve: [IDENTITY / PRODUCT / LAYOUT]. Avoid: [FAILURE MODES].',
  rules: [
    { k: '从文本或首帧开始', v: '用一句话描述场景，或让一张已有构图的图动起来' },
    { k: '写可见动作', v: '描述站位、惯性、物体交互和每个动作的物理后果' },
    { k: '写节拍，不写梗概', v: '用时间戳或短动作序列，让节奏和揭示有落点' },
    { k: '带上声音', v: '对白、环境音、音乐或拟音是镜头设计的一部分' },
    { k: '锁死数量与身份', v: '明确哪些主体、面孔、物体、空间关系必须稳定' },
    { k: '显式保护连续性', v: '写清楚哪些脸、产品几何、布局、服装、背景不能漂移' },
  ],
};

/* ---------------- 灵感案例 ---------------- */
export const INSPIRATIONS = [
  {
    id: 'elephant',
    scene: 'story',
    title: '大象闯进晚宴',
    tags: ['复杂场景', '喜剧', '尺度'],
    duration: 10,
    size: '16:9',
    source: 'Alexandr Wang · Meta 官方预览',
    prompt:
      'A photorealistic elephant stands improbably inside a small, warmly lit dining room during a formal dinner party. Six adults sit around a table with roast dinner, candles, flowers, and wine glasses. The elephant fills the back of the room without breaking the walls or furniture; its trunk reaches forward as the guests notice it and react with restrained surprise, then laughter. One continuous eye-level shot with subtle handheld drift, natural eyelines, believable contact shadows, consistent elephant scale, warm practical lamps, room tone, quiet cutlery, chair movement, and a soft elephant breath. No cuts, no duplicated guests, no changing table layout.',
  },
  {
    id: 'juggle',
    scene: 'story',
    title: '四个橙子的杂耍翻车',
    tags: ['计数', '失败喜剧', '拟音'],
    duration: 10,
    size: '16:9',
    source: 'Meta AI · 官方预览',
    prompt:
      'A man juggles three oranges, adds a fourth, drops them all, and takes a bow anyway. Warm natural morning light, gentle slow motion. A single continuous approximately 10-second moment with a clear beginning, turn, and payoff. AUDIO: quiet room tone with crisp foley. Photorealistic, natural lighting and physics, believable real-world footage. Not a cartoon, not stylized.',
  },
  {
    id: 'ducklings',
    scene: 'story',
    title: '五只小鸭上台阶',
    tags: ['严格计数', '连续性', '障碍'],
    duration: 10,
    size: '16:9',
    source: 'Meta AI · 官方预览',
    prompt:
      'A mother duck leads a line of exactly FIVE ducklings toward a curb; the fifth and smallest duckling struggles at the step, then hops up to rejoin the others. There are exactly five ducklings in total — the same five throughout the entire video. Never add, remove, duplicate, or change the number of ducklings; keep all five visible and consistent from start to finish. Cozy indoor lamplight, authentic home-video look, slightly imperfect handheld framing with natural shake. One continuous approximately 10-second moment with a clear beginning, obstacle, and payoff. Audio: soft webbed footsteps, tiny chirps, room tone, a small scrape at the curb, then a bright chirp when the last duckling succeeds.',
  },
  {
    id: 'courier',
    scene: 'story',
    title: '快递员冲刺（能力探针）',
    tags: ['动作', '音画同步', '物理'],
    duration: 8,
    size: '16:9',
    source: 'AI at Meta · 官方',
    prompt:
      'Create an 8-second photorealistic video that tests prompt adherence, visual fidelity, temporal consistency, audio-video synchronization, and physically accurate fast motion. A courier sprints through a rain-slick urban plaza, vaults a low barrier, and slides to a stop beside a ringing bicycle bell. Keep the same subject, clothing, architecture, lighting, and wet-ground geometry throughout one continuous shot. Sync footsteps, fabric movement, water splashes, and the bell with visible actions. Use a stabilized handheld camera move with believable inertia, contact, and motion blur. No cuts, duplicated limbs, geometry drift, invented captions, or watermarks.',
  },
  {
    id: 'blushfizz',
    scene: 'commercial',
    title: '气泡柠檬水产品片',
    tags: ['产品', '标签稳定', '液体'],
    duration: 10,
    size: '16:9',
    source: 'Ishan Misra · Meta 官方',
    prompt:
      'Create a bright ten-second tabletop commercial for a fictional sparkling pink lemonade named "BLUSH FIZZ". Open on a cold glass bottle lying diagonally in crushed ice with lemon halves, raspberries, mint leaves, pale rose petals, and condensation beads. Keep the cream label and the exact words "BLUSH FIZZ" and "SPARKLING LEMONADE" readable and unchanged. Cut to a side macro shot as the bottle tilts and pours translucent blush-pink lemonade into a clear highball glass filled with ice, lemon slices, raspberries, and mint. Show a continuous liquid stream, rising bubbles, realistic refraction, wet glass, and small splashes without changing the bottle or garnish count. Finish on a close hero shot of the full sparkling glass with a lemon wheel, raspberry, mint sprig, and the same fictional logo in the lower right. Soft pink and mint studio set, high-key diffused light, shallow depth of field, smooth product-camera motion, crisp pour and fizz sounds, no hands or people, no warped label, no extra text, no duplicate fruit.',
  },
  {
    id: 'panda',
    scene: 'motion',
    title: '小熊猫滚下草坡',
    tags: ['动物', '惯性', '面部连续'],
    duration: 8,
    size: '16:9',
    source: 'Chris · Meta 官方预览',
    prompt:
      'Create an 8-second photorealistic nature video of a baby panda tumbling gently down a soft grassy slope in a bright meadow. Keep the panda\u2019s facial features, fur pattern, body proportions, and eye line consistent through every movement. Start with a medium close-up as it loses balance and rolls naturally, then follow with a low, slightly wider camera move as it settles on the grass and looks toward the lens. Preserve one continuous meadow geography, stable daylight, believable contact with the ground, soft fur motion, and realistic inertia. Use clean natural ambience: light wind, grass rustle, small impacts, and a quiet panda vocalization. No cuts, morphing, duplicated animals, floating limbs, text, subtitles, or watermarks.',
  },
  {
    id: 'bernoulli',
    scene: 'motion',
    title: '伯努利原理（停格动画）',
    tags: ['教育', '停格', '道具一致'],
    duration: 10,
    size: '16:9',
    source: 'Ishan Misra · Meta 官方',
    prompt:
      'Create a 12-second stop-motion educational video explaining the Bernoulli principle on a handcrafted classroom table. Use paper arrows, labeled pressure cards, a narrow paper channel, a lightweight ball, and two suspended paper strips. Begin with a top-down view of slow airflow and wide-spaced arrows marked "LOW SPEED / HIGH PRESSURE." Compress the channel so the arrows move faster and replace the cards with "HIGH SPEED / LOW PRESSURE." Cut to the two paper strips lifting toward each other as air passes between them, then show the lightweight ball hovering in a rising stream. Keep every prop materially consistent and move it in small tactile increments. Warm desk lamp, paper texture, clean English labels, locked overhead and close side angles, gentle tick-and-whoosh Foley, no hands, no extra equations, no warped text.',
  },
  {
    id: 'pond',
    scene: 'pov',
    title: '半冻湖边的夜间漫步',
    tags: ['第一人称', '氛围', '雪夜'],
    duration: 10,
    size: '16:9',
    source: 'Meta AI · 官方预览',
    prompt:
      'First-person point of view strolling along the edge of a small half-frozen pond in a snowy suburban park at night. Snow-dusted reeds and cattails line the bank; fresh snow falls gently. Warm orange lamplight reflects softly on the dark open water. Serene and peaceful, with quiet nature sounds: the faint trickle of unfrozen water, a soft breeze through the reeds, distant snow-muffled stillness, and gentle footsteps in the snow. Natural handheld walking camera, cinematic, meditative.',
  },
  {
    id: 'panda2',
    scene: 'motion',
    title: '熊猫翻滚（官方简短版）',
    tags: ['极简提示词', '物理'],
    duration: 5,
    size: '16:9',
    source: 'Meta Superintelligence Labs',
    prompt: 'A baby panda tumbling head over heels down a small grassy slope.',
  },
];

/** 按场景筛选 */
export function inspirationsByScene(sceneId) {
  if (!sceneId || sceneId === 'all') return INSPIRATIONS;
  return INSPIRATIONS.filter((i) => i.scene === sceneId);
}
