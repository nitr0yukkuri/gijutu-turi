/** River-only model and behavior concepts, kept out of the ocean encounter registry. */
export type RiverFishModelKey =
  | "river-ayu"
  | "river-yamame"
  | "river-oikawa"
  | "river-ugui"
  | "river-kawamutsu"
  | "river-namazu"
  | "river-dojo"
  | "river-kamatsuka"
  | "river-koi"
  | "river-ginbuna";

export type RiverBodyPoint = readonly [x: number, halfHeight: number, halfWidth: number, centerY: number];
export type RiverFinPlan = Readonly<{
  root: readonly (readonly [number, number])[];
  edge: readonly (readonly [number, number])[];
}>;

export type RiverFishDesign = Readonly<{
  id: RiverFishModelKey;
  modelKey: RiverFishModelKey;
  number: number;
  name: string;
  rarity: "COMMON" | "UNCOMMON";
  fish: string;
  technology: string;
  technologyConcept: string;
  tagline: string;
  habitat: string;
  appearance: string;
  naturalBehavior: string;
  swimStyle: "tail-driven" | "whole-body" | "bottom-glide";
  gameBehavior: string;
  profile: readonly RiverBodyPoint[];
  dorsal: RiverFinPlan;
  anal: RiverFinPlan;
  tail: "forked" | "shallow-forked" | "rounded" | "truncate";
  palette: Readonly<{ body: number; dorsal: number; belly: number; marking: number; fin: number; accent?: number }>;
  pattern: "spots" | "bars" | "lateral-line" | "scale-arc" | "mottled" | "parr-marks" | "plain";
  motion: Readonly<{ flexStartX: number; flexLength: number; bendGain: number; turnGain: number; finLag: number }>;
}>;

const fins = (root: readonly (readonly [number, number])[], edge: readonly (readonly [number, number])[]): RiverFinPlan => ({ root, edge });

/**
 * Species anatomy is the visual source of truth. Technology is translated into
 * a fight/motion idea, not painted as a logo onto a natural fish body.
 */
export const RIVER_FISH_DESIGNS: readonly RiverFishDesign[] = [
  {
    id: "river-ayu", modelKey: "river-ayu", number: 1, name: "Goアユ", rarity: "COMMON", fish: "アユ",
    technology: "Go · 並行処理", technologyConcept: "複数の仕事を独立して進め、結果をまとめる。",
    tagline: "流れの中で、群れが同時に向きを変える。",
    habitat: "上流〜中流の瀬。成魚は春から秋に川で過ごす。",
    appearance: "細身の流線形、黄緑がかった背、二つの背びれと小さな脂びれ。",
    naturalBehavior: "瀬の流れに向かって定位し、藻を食べる。生活史の一部では海と川を移動する。",
    swimStyle: "tail-driven", gameBehavior: "群れの個体が別々の方向へ短く引き、少し遅れて流れに戻る。",
    profile: [[-1.9,.025,.022,0],[-1.65,.15,.12,.005],[-1.28,.27,.205,.018],[-.78,.35,.25,.025],[-.22,.34,.24,.018],[.30,.25,.18,.006],[.78,.15,.105,0],[1.20,.075,.055,0],[1.52,.05,.035,0],[1.67,.035,.028,0]],
    dorsal: fins([[-.84,.36],[-.42,.40],[.08,.34],[.45,.26]], [[-.82,.36],[-.72,.52],[-.54,.58],[-.34,.54],[-.12,.40],[.15,.34],[.45,.26]]),
    anal: fins([[.18,-.31],[.52,-.25],[.87,-.14]], [[.18,-.31],[.34,-.43],[.55,-.42],[.72,-.30],[.87,-.14]]),
    tail: "forked", palette: { body: 0x9ba99a, dorsal: 0x526b53, belly: 0xd7d4bf, marking: 0x4d6950, fin: 0x708a70 }, pattern: "plain",
    motion: { flexStartX: -.36, flexLength: 1.98, bendGain: .62, turnGain: .42, finLag: .42 },
  },
  {
    id: "river-yamame", modelKey: "river-yamame", number: 2, name: "Rustヤマメ", rarity: "UNCOMMON", fish: "ヤマメ",
    technology: "Rust · 所有権", technologyConcept: "値の所有者と受け渡しを明確にし、安全に扱う。",
    tagline: "岩陰から一気に出て、流れへ戻る。",
    habitat: "冷たく澄んだ上流域。",
    appearance: "厚みのあるサケ科の体、背中の黒点、体側に並ぶ小判形のパーマーク、脂びれ。",
    naturalBehavior: "流れの筋や石陰で定位し、餌を取ると短く突進して元の場所へ戻る。",
    swimStyle: "tail-driven", gameBehavior: "短い加速のあとに減速し、向きを切り替える。長い直線突進にはしない。",
    profile: [[-1.88,.03,.026,0],[-1.62,.20,.15,.012],[-1.23,.38,.255,.028],[-.72,.49,.31,.032],[-.18,.46,.30,.026],[.34,.35,.23,.015],[.80,.22,.145,0],[1.18,.12,.08,0],[1.52,.065,.045,0],[1.68,.04,.03,0]],
    dorsal: fins([[-.78,.45],[-.25,.46],[.24,.36],[.53,.27]], [[-.78,.45],[-.60,.64],[-.34,.72],[-.12,.66],[.12,.49],[.32,.39],[.53,.27]]),
    anal: fins([[.22,-.34],[.54,-.29],[.86,-.18]], [[.22,-.34],[.38,-.48],[.59,-.46],[.74,-.33],[.86,-.18]]),
    tail: "forked", palette: { body: 0xa5aaa0, dorsal: 0x59635b, belly: 0xd6d1c3, marking: 0x343d37, fin: 0x747f75 }, pattern: "parr-marks",
    motion: { flexStartX: -.22, flexLength: 1.82, bendGain: .68, turnGain: .52, finLag: .34 },
  },
  {
    id: "river-oikawa", modelKey: "river-oikawa", number: 3, name: "CSSオイカワ", rarity: "COMMON", fish: "オイカワ",
    technology: "CSS · 構造と見た目", technologyConcept: "骨格を保ちながら、状態に応じて外観を変える。",
    tagline: "魚体はそのまま、婚姻色だけが走る。",
    habitat: "中流〜下流の開けた浅瀬。",
    appearance: "細く銀白色の体。繁殖期のオスは青や赤みを帯びた婚姻色が現れる。",
    naturalBehavior: "浅瀬や流れの速い場所を泳ぎ、繁殖期は群れで浅い砂礫底に集まる。",
    swimStyle: "tail-driven", gameBehavior: "平常時は軽快。抵抗が上がると短い横走りを挟み、色の状態変化は控えめに出す。",
    profile: [[-1.9,.025,.02,0],[-1.64,.15,.11,.005],[-1.27,.28,.18,.015],[-.78,.36,.225,.02],[-.22,.34,.22,.016],[.30,.26,.17,.008],[.78,.15,.095,0],[1.18,.075,.05,0],[1.50,.045,.032,0],[1.65,.03,.024,0]],
    dorsal: fins([[-.82,.31],[-.36,.35],[.12,.29],[.49,.21]], [[-.82,.31],[-.69,.47],[-.48,.53],[-.27,.48],[-.05,.34],[.19,.29],[.49,.21]]),
    anal: fins([[.12,-.27],[.45,-.23],[.80,-.13]], [[.12,-.27],[.28,-.40],[.48,-.39],[.65,-.28],[.80,-.13]]),
    tail: "forked", palette: { body: 0xb2b9b5, dorsal: 0x667d7b, belly: 0xe2ded2, marking: 0x647f88, fin: 0x7e9997 }, pattern: "bars",
    motion: { flexStartX: -.42, flexLength: 1.94, bendGain: .58, turnGain: .48, finLag: .38 },
  },
  {
    id: "river-ugui", modelKey: "river-ugui", number: 4, name: "K8sウグイ", rarity: "COMMON", fish: "ウグイ",
    technology: "Kubernetes · オーケストレーション", technologyConcept: "複数の処理をまとめ、状況に合わせて配置を整える。",
    tagline: "広がった群れが、流れに合わせてまとまる。",
    habitat: "上流から河口まで。淵や砂利場など、川の幅広い環境。",
    appearance: "やや厚みのある銀色の体。繁殖期の赤い横帯は季節表現として薄く扱う。",
    naturalBehavior: "流域を広く利用し、季節や成長段階で生息場所を移す。",
    swimStyle: "tail-driven", gameBehavior: "小群が位置をずらして追従し、突進時だけ隊形が開く。個体は本体の動きから遅れすぎない。",
    profile: [[-1.9,.03,.025,0],[-1.63,.19,.14,.008],[-1.22,.36,.24,.023],[-.70,.45,.29,.03],[-.15,.42,.275,.022],[.36,.32,.21,.01],[.82,.19,.13,0],[1.20,.105,.07,0],[1.53,.058,.04,0],[1.68,.035,.028,0]],
    dorsal: fins([[-.76,.42],[-.24,.43],[.23,.33],[.58,.22]], [[-.76,.42],[-.60,.61],[-.36,.67],[-.12,.60],[.10,.43],[.34,.33],[.58,.22]]),
    anal: fins([[.24,-.31],[.55,-.25],[.88,-.15]], [[.24,-.31],[.40,-.43],[.60,-.42],[.76,-.30],[.88,-.15]]),
    tail: "forked", palette: { body: 0xaeb4aa, dorsal: 0x69736a, belly: 0xd8d7cb, marking: 0xaeb4aa, fin: 0x77867b }, pattern: "lateral-line",
    motion: { flexStartX: -.34, flexLength: 1.92, bendGain: .60, turnGain: .55, finLag: .44 },
  },
  {
    id: "river-kawamutsu", modelKey: "river-kawamutsu", number: 5, name: "JSカワムツ", rarity: "COMMON", fish: "カワムツ",
    technology: "JavaScript · イベントループ", technologyConcept: "入力に反応し、順番に処理しながら止まらず進む。",
    tagline: "物音に反応して、淵の中を素早く切り返す。",
    habitat: "主に中上流の淵や、流れの緩い場所。地域差がある。",
    appearance: "黄褐色を帯びた銀色の体と、側面を走る一本の黒い線。",
    naturalBehavior: "淵の近くで水生昆虫や小魚を食べる。繁殖期の色は常時表示しない。",
    swimStyle: "tail-driven", gameBehavior: "小さな反応を素早く返すが、連続する大突進ではなく短い切り返し中心。",
    profile: [[-1.88,.03,.025,0],[-1.61,.19,.145,.008],[-1.21,.37,.245,.022],[-.68,.48,.30,.03],[-.13,.45,.29,.024],[.37,.34,.22,.01],[.82,.20,.13,0],[1.18,.11,.073,0],[1.50,.06,.041,0],[1.65,.037,.029,0]],
    dorsal: fins([[-.78,.44],[-.25,.46],[.22,.34],[.57,.22]], [[-.78,.44],[-.61,.60],[-.39,.65],[-.15,.57],[.09,.42],[.34,.32],[.57,.22]]),
    anal: fins([[.24,-.32],[.54,-.26],[.87,-.15]], [[.24,-.32],[.40,-.45],[.60,-.42],[.76,-.29],[.87,-.15]]),
    tail: "forked", palette: { body: 0xa99d7e, dorsal: 0x655f49, belly: 0xd8d1b9, marking: 0x444536, fin: 0x777153 }, pattern: "lateral-line",
    motion: { flexStartX: -.38, flexLength: 1.91, bendGain: .62, turnGain: .62, finLag: .30 },
  },
  {
    id: "river-namazu", modelKey: "river-namazu", number: 6, name: "Dockerナマズ", rarity: "UNCOMMON", fish: "ナマズ",
    technology: "Docker · コンテナ", technologyConcept: "実行単位をひとまとまりにして、環境の中で動かす。",
    tagline: "底に沿って待ち、掛かると重く動き出す。",
    habitat: "中流〜下流の淵、岸際、湖沼。",
    appearance: "鱗の目立たない長い体、幅広く平たい頭、長い口ひげ、丸みのある尾。",
    naturalBehavior: "日中は物陰に隠れ、夜に餌を探す底層の捕食魚。",
    swimStyle: "whole-body", gameBehavior: "低い姿勢でゆっくり向きを変え、最初の一引きは重く、短い加速後に滑る。",
    profile: [[-1.92,.035,.036,-.02],[-1.78,.20,.24,-.005],[-1.50,.34,.31,.005],[-1.08,.38,.29,.018],[-.60,.34,.25,.022],[-.08,.27,.20,.012],[.45,.18,.13,0],[.91,.10,.072,0],[1.31,.058,.041,0],[1.52,.04,.03,0]],
    dorsal: fins([[-.34,.30],[.12,.25],[.58,.17]], [[-.34,.30],[-.25,.42],[-.06,.46],[.17,.37],[.38,.25],[.58,.17]]),
    anal: fins([[-.05,-.25],[.44,-.18],[.91,-.09]], [[-.05,-.25],[.14,-.35],[.46,-.34],[.70,-.22],[.91,-.09]]),
    tail: "rounded", palette: { body: 0x776e54, dorsal: 0x464b37, belly: 0xb4a987, marking: 0x4b4b37, fin: 0x625e49 }, pattern: "mottled",
    motion: { flexStartX: -.18, flexLength: 1.65, bendGain: .43, turnGain: .30, finLag: .62 },
  },
  {
    id: "river-dojo", modelKey: "river-dojo", number: 7, name: "Pythonドジョウ", rarity: "COMMON", fish: "ドジョウ",
    technology: "Python · 柔軟な処理", technologyConcept: "同じ目的へ、読みやすく柔軟な手順でたどり着く。",
    tagline: "細長い体を波打たせ、底の隙間を抜ける。",
    habitat: "中下流の泥底、水路、水田につながる浅場。",
    appearance: "円筒形の細長い体、小さな胸びれ、口のまわりの複数のひげ。",
    naturalBehavior: "底で餌を探し、驚くと泥に潜る。口ひげで底の餌を探る。",
    swimStyle: "whole-body", gameBehavior: "体全体へ伝わる柔らかい波。底近くで小さく向きを変え、引きは軽く細かい。",
    profile: [[-1.88,.022,.022,0],[-1.64,.11,.085,0],[-1.28,.15,.115,.002],[-.84,.16,.12,.005],[-.38,.15,.112,.005],[.10,.13,.095,.003],[.57,.105,.075,0],[1.0,.075,.052,0],[1.40,.045,.032,0],[1.62,.026,.02,0]],
    dorsal: fins([[-.45,.145],[.05,.12],[.55,.09]], [[-.45,.145],[-.28,.22],[.02,.23],[.30,.17],[.55,.09]]),
    anal: fins([[.18,-.12],[.57,-.09],[.91,-.06]], [[.18,-.12],[.34,-.19],[.60,-.18],[.78,-.12],[.91,-.06]]),
    tail: "rounded", palette: { body: 0x9b8063, dorsal: 0x65523e, belly: 0xc4ac8c, marking: 0x594632, fin: 0x79654d }, pattern: "mottled",
    motion: { flexStartX: -1.52, flexLength: 3.12, bendGain: .92, turnGain: .68, finLag: .20 },
  },
  {
    id: "river-kamatsuka", modelKey: "river-kamatsuka", number: 8, name: "SQLカマツカ", rarity: "COMMON", fish: "カマツカ",
    technology: "SQL · 検索と抽出", technologyConcept: "条件に合う情報を探し、必要なものを取り出す。",
    tagline: "砂底をなぞり、餌を探して少しずつ進む。",
    habitat: "中下流の砂底・砂礫底。",
    appearance: "前へ突き出した吻、平たい腹、低い位置につく口。底生魚らしい姿勢。",
    naturalBehavior: "胸びれで砂を動かし、餌と砂を吸い込んで砂だけを吐き出す。",
    swimStyle: "bottom-glide", gameBehavior: "大きく跳ねず、底すれすれに進んで短く止まる。餌を探す小さな首振り。",
    profile: [[-2.08,.075,.11,-.03],[-1.88,.14,.165,-.02],[-1.62,.22,.205,-.008],[-1.38,.27,.22,.004],[-1.04,.29,.22,.006],[-.58,.27,.20,.008],[-.08,.21,.155,.004],[.40,.14,.10,0],[.84,.08,.057,0],[1.20,.046,.032,0],[1.38,.03,.022,0]],
    dorsal: fins([[-.62,.25],[-.14,.20],[.31,.12]], [[-.62,.25],[-.45,.36],[-.18,.38],[.08,.29],[.31,.12]]),
    anal: fins([[.20,-.20],[.50,-.14],[.80,-.08]], [[.20,-.20],[.34,-.29],[.55,-.27],[.70,-.18],[.80,-.08]]),
    tail: "truncate", palette: { body: 0x9a8a70, dorsal: 0x625a45, belly: 0xc4b69b, marking: 0x514b3b, fin: 0x79705c }, pattern: "mottled",
    motion: { flexStartX: .02, flexLength: 1.30, bendGain: .34, turnGain: .26, finLag: .72 },
  },
  {
    id: "river-koi", modelKey: "river-koi", number: 9, name: "Javaコイ", rarity: "UNCOMMON", fish: "コイ",
    technology: "Java · 長く動く実行環境", technologyConcept: "長く動き続ける処理を安定して運用する。",
    tagline: "ゆっくり向きを変え、重い力を保ち続ける。",
    habitat: "中下流の淵、流れの緩い場所、ダム湖。",
    appearance: "大きく厚い体、厚い唇、二対の口ひげ、幅のある尾。",
    naturalBehavior: "底層で餌を探す雑食魚。砂泥も吸い込み、餌を選り分ける。",
    swimStyle: "tail-driven", gameBehavior: "重い初動と強い慣性。向きを変えると尾と胴が遅れてついてくる。",
    profile: [[-1.92,.035,.035,-.01],[-1.68,.21,.17,0],[-1.28,.42,.30,.012],[-.78,.55,.38,.025],[-.22,.54,.39,.027],[.30,.43,.32,.016],[.78,.27,.20,0],[1.17,.14,.10,0],[1.49,.075,.052,0],[1.66,.043,.032,0]],
    dorsal: fins([[-.70,.51],[-.08,.54],[.56,.31],[.94,.19]], [[-.70,.51],[-.52,.72],[-.26,.82],[.02,.75],[.30,.56],[.56,.31],[.94,.19]]),
    anal: fins([[.42,-.41],[.78,-.28],[1.04,-.18]], [[.42,-.41],[.55,-.56],[.78,-.58],[.94,-.40],[1.04,-.18]]),
    tail: "forked", palette: { body: 0x918e6f, dorsal: 0x5c6048, belly: 0xc8c2a8, marking: 0x626247, fin: 0x73745a }, pattern: "scale-arc",
    motion: { flexStartX: -.08, flexLength: 1.76, bendGain: .46, turnGain: .32, finLag: .70 },
  },
  {
    id: "river-ginbuna", modelKey: "river-ginbuna", number: 10, name: "Linuxギンブナ", rarity: "COMMON", fish: "ギンブナ",
    technology: "Linux · 基盤", technologyConcept: "多くの用途を支える、安定した共通の土台。",
    tagline: "静かな場所を保ち、乱れた流れを受け流す。",
    habitat: "中下流のゆるい流れ、岸のヨシ帯、池や水路。",
    appearance: "背が高く側扁した銀色の体。コイのような口ひげはない。",
    naturalBehavior: "流れの弱い場所で暮らす雑食魚。",
    swimStyle: "tail-driven", gameBehavior: "中層をゆったり保ち、急旋回より短い横移動と姿勢回復を使う。",
    profile: [[-1.88,.03,.03,0],[-1.64,.19,.15,.006],[-1.27,.39,.28,.018],[-.80,.55,.37,.025],[-.28,.58,.39,.025],[.22,.49,.34,.017],[.65,.34,.24,.006],[1.02,.19,.13,0],[1.36,.09,.065,0],[1.55,.05,.035,0]],
    dorsal: fins([[-.58,.55],[-.08,.57],[.44,.41],[.82,.23]], [[-.58,.55],[-.42,.74],[-.18,.82],[.08,.74],[.32,.54],[.58,.37],[.82,.23]]),
    anal: fins([[.35,-.42],[.68,-.32],[.95,-.18]], [[.35,-.42],[.48,-.56],[.69,-.58],[.84,-.40],[.95,-.18]]),
    tail: "shallow-forked", palette: { body: 0xa8aea9, dorsal: 0x65716d, belly: 0xd9d9d0, marking: 0x667570, fin: 0x7d8984 }, pattern: "plain",
    motion: { flexStartX: -.18, flexLength: 1.68, bendGain: .40, turnGain: .28, finLag: .72 },
  },
];

export const getRiverFishDesign = (modelKey: string): RiverFishDesign | undefined =>
  RIVER_FISH_DESIGNS.find(fish => fish.modelKey === modelKey);
