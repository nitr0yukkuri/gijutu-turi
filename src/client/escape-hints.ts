export const FISH_ESCAPE_HINTS: Readonly<Record<string, readonly [string, string]>> = {
  missed: ["合わせるタイミングが遅れました。", "ウキが沈んだら、ボタンを押してください。"],
  line: ["糸が切れました。", "糸の張りが赤くなる前に、巻くのを止めてください。"],
  slack: ["針が外れました。", "魚が掛かったら、糸を緩めすぎないでください。"],
  distance: ["魚が逃げました。", "糸の張りを見ながら巻き、強く引かれたらいったん緩めてください。"],
};
