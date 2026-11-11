const GLUED: [RegExp, string][] = [
  [/^fancy(?=\S)/, "fancy "], [/^antique(?=\S)/, "antique "], [/^gp(?=[a-z])/, "gp "],
  [/kukumachimil|kumkumachimil/, "kumkuma chimil"], [/karupupassi/, "karupu pasi"],
  [/^backchain|^backchian/, "back chain"], [/^valaikappu$/, "valaikappu"],
];

const WORD: Record<string, string> = {
  cahin: "chain", chian: "chain", banagle: "bangle", banlge: "bangle", bngle: "bangle", banglr: "bangle", banglre: "bangle",
  beaclet: "bracelet", braclet: "bracelet", braclets: "bracelet", bracelets: "bracelet", baclet: "bracelet", baraclet: "bracelet",
  barclet: "bracelet", braclert: "bracelet", braclett: "bracelet", cloin: "coin", neklace: "necklace", nekclace: "necklace",
  neklcae: "necklace", necklce: "necklace", necklcase: "necklace", necklcae: "necklace", oin: "pin", sud: "stud", stuf: "stud", stu: "stud",
  maalai: "malai", malao: "malai", kaapu: "kappu", kapu: "kappu", kaasu: "kasu", kassu: "kasu", managa: "manga", maanga: "manga",
  maatal: "mattal", mugapu: "mugappu", thaythu: "thayathu", thyathu: "thayathu", jimiki: "jimikki", jimmiki: "jimikki",
  kolsusu: "kolusu", kokusu: "kolusu", kouslu: "kolusu", kousu: "kolusu", kulusu: "kolusu", kolus: "kolusu", ul: "ull",
  meeti: "metti", meti: "metti", metii: "metti", anitque: "antique", antiqu: "antique", muthruna: "mutharuna", muthuruna: "mutharuna",
  paathitam: "paathiram", pathiram: "paathiram", bathiram: "paathiram", tahandai: "thandai", tanda: "thandai", tandai: "thandai",
  tumler: "tumbler", thumbler: "tumbler", tambler: "tumbler", velaku: "vilaku", veilaku: "vilaku", vilkau: "vilaku",
  karugali: "karungali", chiml: "chimil", simil: "chimil", kuguma: "kumkuma", kunkuma: "kumkuma", kouguma: "kumkuma",
  krupu: "karupu", karupuu: "karupu", paasi: "pasi", passi: "pasi", surl: "surul", fanyc: "fancy", fnacy: "fancy", sarre: "saree",
  dolllar: "dollar", diamnod: "diamond", ruthracham: "ruthraksham", ruthraksam: "ruthraksham", ruthraksha: "ruthraksham",
  ruthraksaha: "ruthraksham", ruthrasam: "ruthraksham", mala: "malai", santhapeda: "sandhana peda", sandhana: "sandhana",
  tokiyo: "tokyo", tokoyo: "tokyo", naikaasu: "naikasu", menakshi: "meenakshi", valakapu: "valaikappu", valaikaapu: "valaikappu",
  yana: "yana", nandh: "nandhi",
};

const PHRASE: Record<string, string> = {
  "rope": "rope chain", "yana kulai": "yanakulai", "kolusu fancy": "fancy kolusu", "nose pin diamond": "nose pin (diamond)",
  "stud diamond": "stud (diamond)", "ring diamond": "ring (diamond)", "diamond stud": "stud (diamond)", "kappu baby": "baby kappu",
  "kambi tandai": "kambi thandai", "karupu pasi": "karupu pasi bangle", "karupu pasi valayal": "karupu pasi bangle",
  "karupu valayal pasi": "karupu pasi bangle", "karupu paasi valayal": "karupu pasi bangle", "rectangular kada": "rectangle kada",
  "r kada": "rectangle kada", "kasu mani": "kasu mani", "kasu/mani": "kasu mani", "meenakshi idol": "meenakshi silai",
  "valaikappu kappu": "valaikappu", "valaikappu bangle": "valaikappu", "valaikappu valayal": "valaikappu",
  "karungali maalai": "karungali malai",
};

const title = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\bGp\b/g, "GP");

export function cleanItem(raw: string | null): string | null {
  if (!raw) return null;
  let s = raw.toLowerCase().replace(/[`'"]/g, "").replace(/\s+/g, " ").trim();
  if (/^kasu[,/ ]+mani$|^kaasu[,/ ]+mani$|^kassu[,/ ]+mani$/.test(s)) return "Kasu Mani";
  if (/[,&]|\w\.\w|\w\/\w/.test(s.replace(/[,.]\s*$/, ""))) return "Mixed";
  s = s.replace(/[,.]\s*$/, "").replace(/\(\s*[\d.]+\s*\)/g, "").replace(/\s*\(\s*([a-z ]+)\s*\)/g, " $1").replace(/[-]/g, " ").replace(/\s+/g, " ").trim();
  for (const [re, to] of GLUED) s = s.replace(re, to);
  s = s.split(" ").map((w) => WORD[w] ?? w).join(" ").replace(/\s+/g, " ").trim();
  if (s === "f bangle" || s === "f metti" || s === "f ring" || s === "f.ring") s = s.replace(/^f\.?\s?/, "fancy ");
  s = PHRASE[s] ?? s;
  if (/^nose pin diamond$/.test(s)) s = "nose pin (diamond)";
  if (/^(stud|ring) diamond$/.test(s)) s = `${s.split(" ")[0]} (diamond)`;
  return s ? title(s) : null;
}
