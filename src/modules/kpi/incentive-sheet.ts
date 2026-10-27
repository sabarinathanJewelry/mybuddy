// ─── Types ─────────────────────────────────────────────────────────────────────
export interface MasterEntry  { code: string; rate: number; minWastage: number; perSale?: boolean }
export interface MapperEntry  { erpName: string; incentiveCode: string; notes: string }
export interface CalcRow {
  idx: number; date: string; product: string; wastage: number;
  netWt: number; balance: number; sp1: string; sp2: string;
  customer: string; mobile: string; billNo: string;
}
export interface RowOverride  { balanceZero?: boolean; paidDate?: string; minWastage?: number; sp1Share?: number; wastage?: number; amountPaid?: number; writeOffAmt?: number; forceIneligible?: boolean; boardRate?: number; rateOverride?: number; }

// ─── Initial Master Rate Table (official incentive codes only) ─────────────────
export const INITIAL_MASTER: MasterEntry[] = [
  { code: "18K CHAIN",              rate: 3,   minWastage: 15 },
  { code: "K SUNDARI CHAIN",        rate: 3,   minWastage: 5  },
  { code: "KAJUKATLI CHAIN",        rate: 3,   minWastage: 7  },
  { code: "KERALA CHAIN",           rate: 3,   minWastage: 5  },
  { code: "MACHINE CHAIN",          rate: 3,   minWastage: 5  },
  { code: "DELHI CHAIN",            rate: 3,   minWastage: 5  },
  { code: "LOTUS CHAIN",            rate: 3,   minWastage: 5  },
  { code: "FANCY LOTUS CHAIN",      rate: 3,   minWastage: 5  },
  { code: "S LEAF BALLS CHAIN",     rate: 3,   minWastage: 5  },
  { code: "S LEAF CHAIN",           rate: 3,   minWastage: 5  },
  { code: "IPL CHAIN",              rate: 3,   minWastage: 6  },
  { code: "MUGAPPU CHAIN",          rate: 3,   minWastage: 6  },
  { code: "BAAHUBALI CHAIN",        rate: 3,   minWastage: 6  },
  { code: "INDO ITALY CHAIN",       rate: 3,   minWastage: 7  },
  { code: "MILLER CHAIN",           rate: 3,   minWastage: 7  },
  { code: "ITALY CHAIN",            rate: 3,   minWastage: 8  },
  { code: "BACK CHAIN",             rate: 3,   minWastage: 5  },
  { code: "CHOCO CHAIN",            rate: 3,   minWastage: 7  },
  { code: "NAAGINI CHAIN",          rate: 3,   minWastage: 7  },
  { code: "SACHIN TENDULKAR CHAIN", rate: 3,   minWastage: 6  },
  { code: "FANCY BALLS CHAIN",      rate: 3,   minWastage: 8  },
  { code: "FANCY S L CHAIN",        rate: 3,   minWastage: 8  },
  { code: "FANCY CHAIN",            rate: 3,   minWastage: 8  },
  { code: "ROPE CHAIN",             rate: 2,   minWastage: 3  },
  { code: "COINS",                  rate: 0,   minWastage: 0  },
  { code: "BABY BANGLES",           rate: 5,   minWastage: 7  },
  { code: "CBE BANGLES",            rate: 3,   minWastage: 5  },
  { code: "FANCY BANGLES",          rate: 4,   minWastage: 7  },
  { code: "BOMBAY BANGLES",         rate: 4,   minWastage: 7  },
  { code: "ANTIQUE BANGLES",        rate: 7,   minWastage: 9  },
  { code: "STAMPING BRACELET",      rate: 4,   minWastage: 8  },
  { code: "BOMBAY BRACELET",        rate: 4,   minWastage: 8  },
  { code: "LEATHER BRACELET",       rate: 2,   minWastage: 8  },
  { code: "CBE BRACELET",           rate: 5,   minWastage: 6  },
  { code: "BABY BRACELET",          rate: 5,   minWastage: 6  },
  { code: "FANCY BRACELET",         rate: 5,   minWastage: 8  },
  { code: "FANCY KAPPU",            rate: 5,   minWastage: 10 },
  { code: "CASTING BRACELET",       rate: 5,   minWastage: 11 },
  { code: "MUGAPPU DOLLAR",         rate: 8,   minWastage: 11 },
  { code: "FISH DOLLAR",            rate: 8,   minWastage: 10 },
  { code: "CASTING DOLLAR",         rate: 8,   minWastage: 11 },
  { code: "BOMBAY DOLLAR",          rate: 8,   minWastage: 11 },
  { code: "LAKSHMI DOLLAR",         rate: 8,   minWastage: 11 },
  { code: "FANCY DOLLAR",           rate: 8,   minWastage: 9  },
  { code: "KERALA MALAI",           rate: 6,   minWastage: 5  },
  { code: "KASU MALAI",             rate: 6,   minWastage: 7  },
  { code: "CBE MALAI",              rate: 6,   minWastage: 7  },
  { code: "CASTING MALA",           rate: 6,   minWastage: 9  },
  { code: "TURKEY MALAI",           rate: 6,   minWastage: 9  },
  { code: "BOMBAY MALAI",           rate: 5,   minWastage: 9  },
  { code: "FANCY MALAI",            rate: 5,   minWastage: 9  },
  { code: "ANTIQUE MALAI",          rate: 7,   minWastage: 9  },
  { code: "KERALA NECKLACE",        rate: 5,   minWastage: 5  },
  { code: "CBE NECKLACE",           rate: 6,   minWastage: 7  },
  { code: "FANCY NECKLACE",         rate: 5,   minWastage: 9  },
  { code: "TURKEY NECKLACE",        rate: 6,   minWastage: 9  },
  { code: "CASTING NECKLACE",       rate: 6,   minWastage: 9  },
  { code: "BOMBAY NECKLACE",        rate: 6,   minWastage: 9  },
  { code: "BOMBAY CHOKER",          rate: 6,   minWastage: 9  },
  { code: "ANTIQUE NECKLACE",       rate: 7,   minWastage: 9  },
  { code: "ANTIQUE CHOKER",         rate: 7,   minWastage: 9  },
  { code: "BABY RING",              rate: 7,   minWastage: 9  },
  { code: "BOMBAY RING",            rate: 7,   minWastage: 9  },
  { code: "BOLE TV RING",           rate: 7,   minWastage: 6  },
  { code: "CBE RING",               rate: 7,   minWastage: 6  },
  { code: "MAHARAJA RING",          rate: 7,   minWastage: 7  },
  { code: "MALABAR RING",           rate: 7,   minWastage: 8  },
  { code: "WEDDING RING",           rate: 7,   minWastage: 8  },
  { code: "FANCY RING",             rate: 7,   minWastage: 11 },
  { code: "CASTING RING",           rate: 7,   minWastage: 11 },
  { code: "CBE STUD",               rate: 7,   minWastage: 8  },
  { code: "CBE MATTAL",             rate: 7,   minWastage: 8  },
  { code: "BOMBAY MATTAL",          rate: 7,   minWastage: 8  },
  { code: "FANCY MATTAL",           rate: 7,   minWastage: 8  },
  { code: "DELHI MATTAL",           rate: 7,   minWastage: 8  },
  { code: "BABY STUD",              rate: 7,   minWastage: 12 },
  { code: "FANCY JIMIKKI",          rate: 7,   minWastage: 11 },
  { code: "JIMIKKI KAMMAL",         rate: 7,   minWastage: 11 },
  { code: "KERALA STUD",            rate: 7,   minWastage: 11 },
  { code: "NAGMA STUD",             rate: 7,   minWastage: 16 },
  { code: "FANCY STUD",             rate: 7,   minWastage: 11 },
  { code: "ROSE GOLD STUD",         rate: 7,   minWastage: 15 },
  { code: "CASTING STUD",           rate: 7,   minWastage: 11 },
  { code: "BOMBAY STUD",            rate: 7,   minWastage: 11 },
  { code: "KASA STUD",              rate: 7,   minWastage: 9  },
  { code: "TURKEY STUD",            rate: 7,   minWastage: 11 },
  { code: "KUMKI STUD",             rate: 7,   minWastage: 9  },
  { code: "BOMMI STUD",             rate: 7,   minWastage: 9  },
  { code: "STONE STUD",             rate: 7,   minWastage: 16 },
  { code: "ANTIQUE STUD",           rate: 7,   minWastage: 11 },
  { code: "ANTIQUE JIMIKKI",        rate: 7,   minWastage: 11 },
  { code: "THALI",                  rate: 7,   minWastage: 11 },
  { code: "MANI",                   rate: 7,   minWastage: 11 },
  { code: "LAKSHMI KASU",           rate: 7,   minWastage: 11 },
  { code: "MANGA KASU",             rate: 7,   minWastage: 11 },
  { code: "PLAIN THAYATTU",         rate: 7,   minWastage: 11 },
  { code: "ROUND THAYATTU",         rate: 7,   minWastage: 11 },
  { code: "SIDE STUD",              rate: 10,  minWastage: 1  },
  { code: "DIAMOND BESARI",         rate: 100, minWastage: 1, perSale: true },
  { code: "DIAMOND STUD",           rate: 200, minWastage: 1, perSale: true },
  { code: "DIAMOND RING",           rate: 200, minWastage: 1, perSale: true },
  { code: "DIAMOND NECKLACE",       rate: 500, minWastage: 1, perSale: true },
  { code: "DIA NECKLACE",           rate: 500, minWastage: 1, perSale: true },
  { code: "SB",                     rate: 0,   minWastage: 1  },
  { code: "S",                      rate: 0.5, minWastage: 1  },
  { code: "92.5-S",                 rate: 5,   minWastage: 1  },
  { code: "92.5-L",                 rate: 3,   minWastage: 1  },
  { code: "GOLD KOLUSU",            rate: 3,   minWastage: 7  },
];

// ─── Initial ERP → Incentive Code Mapper ──────────────────────────────────────
export const INITIAL_MAPPER: MapperEntry[] = [
  // Gold Bangles
  { erpName: "FANCY BANGLES",           incentiveCode: "FANCY BANGLES",      notes: "" },
  { erpName: "BOMBAY BANGLES",          incentiveCode: "BOMBAY BANGLES",     notes: "" },
  { erpName: "BABY BANGLES",            incentiveCode: "BABY BANGLES",       notes: "" },
  { erpName: "ANTIQUE BANGLES",         incentiveCode: "ANTIQUE BANGLES",    notes: "" },
  { erpName: "CBE BANGLES",             incentiveCode: "CBE BANGLES",        notes: "" },
  { erpName: "VALAIYAM",                incentiveCode: "FANCY BANGLES",      notes: "Bangle type" },
  { erpName: "FANCY KAPPU",             incentiveCode: "FANCY KAPPU",        notes: "" },
  // Chains
  { erpName: "BAAHUBALI CHAIN",         incentiveCode: "BAAHUBALI CHAIN",    notes: "" },
  { erpName: "FANCY BAAHUBALI CHAIN",   incentiveCode: "BAAHUBALI CHAIN",    notes: "" },
  { erpName: "BACK CHAIN",              incentiveCode: "BACK CHAIN",         notes: "" },
  { erpName: "CHOCO CHAIN",             incentiveCode: "CHOCO CHAIN",        notes: "" },
  { erpName: "DELHI CHAIN",             incentiveCode: "DELHI CHAIN",        notes: "" },
  { erpName: "FANCY BALLS CHAIN",       incentiveCode: "FANCY BALLS CHAIN",  notes: "" },
  { erpName: "FANCY CHAIN",             incentiveCode: "FANCY CHAIN",        notes: "" },
  { erpName: "FANCY S L CHAIN",         incentiveCode: "FANCY S L CHAIN",    notes: "" },
  { erpName: "INDO ITALY CHAIN",        incentiveCode: "INDO ITALY CHAIN",   notes: "" },
  { erpName: "ITALY CHAIN",             incentiveCode: "ITALY CHAIN",        notes: "" },
  { erpName: "K SUNDARI CHAIN",         incentiveCode: "K SUNDARI CHAIN",    notes: "" },
  { erpName: "SUNDRI CHAIN",            incentiveCode: "K SUNDARI CHAIN",    notes: "ERP typo" },
  { erpName: "KAJUKATLI CHAIN",         incentiveCode: "KAJUKATLI CHAIN",    notes: "" },
  { erpName: "LOTUS CHAIN",             incentiveCode: "LOTUS CHAIN",        notes: "" },
  { erpName: "MACHINE CHAIN",           incentiveCode: "MACHINE CHAIN",      notes: "" },
  { erpName: "MUGAPPU CHAIN",           incentiveCode: "MUGAPPU CHAIN",      notes: "" },
  { erpName: "ROPE CHAIN",              incentiveCode: "ROPE CHAIN",         notes: "" },
  { erpName: "S LEAF CHAIN",            incentiveCode: "S LEAF CHAIN",       notes: "" },
  { erpName: "S LEAF BALLS CHAIN",      incentiveCode: "S LEAF BALLS CHAIN", notes: "" },
  { erpName: "SACHIN TENDULKAR CHAIN",  incentiveCode: "SACHIN TENDULKAR CHAIN", notes: "" },
  { erpName: "NAAGINI CHAIN",           incentiveCode: "NAAGINI CHAIN",      notes: "" },
  { erpName: "KERALA CHAIN",            incentiveCode: "KERALA CHAIN",       notes: "" },
  { erpName: "MILLER CHAIN",            incentiveCode: "MILLER CHAIN",       notes: "" },
  { erpName: "IPL CHAIN",               incentiveCode: "IPL CHAIN",          notes: "" },
  { erpName: "18K CHAIN",               incentiveCode: "18K CHAIN",          notes: "" },
  { erpName: "CHAIN",                   incentiveCode: "S",                  notes: "Plain silver chain" },
  // Bracelets
  { erpName: "CASTING BRACELET",        incentiveCode: "CASTING BRACELET",   notes: "" },
  { erpName: "BABY BRACELET",           incentiveCode: "BABY BRACELET",      notes: "" },
  { erpName: "BOMBAY BRACELET",         incentiveCode: "BOMBAY BRACELET",    notes: "" },
  { erpName: "CBE BRACELET",            incentiveCode: "CBE BRACELET",       notes: "" },
  { erpName: "LEATHER BRACELET",        incentiveCode: "LEATHER BRACELET",   notes: "" },
  { erpName: "STAMPING BRACELET",       incentiveCode: "STAMPING BRACELET",  notes: "" },
  { erpName: "FANCY BRACELET",          incentiveCode: "FANCY BRACELET",     notes: "" },
  { erpName: "CUBAN BRACELET",          incentiveCode: "CASTING BRACELET",   notes: "" },
  { erpName: "BRACELET",                incentiveCode: "S",                  notes: "Silver bracelet" },
  // Rings
  { erpName: "CBE RING",                incentiveCode: "CBE RING",           notes: "" },
  { erpName: "CASTING RING",            incentiveCode: "CASTING RING",       notes: "" },
  { erpName: "BABY RING",               incentiveCode: "BABY RING",          notes: "" },
  { erpName: "BOMBAY RING",             incentiveCode: "BOMBAY RING",        notes: "" },
  { erpName: "MAHARAJA RING",           incentiveCode: "MAHARAJA RING",      notes: "" },
  { erpName: "WEDDING RING",            incentiveCode: "WEDDING RING",       notes: "" },
  { erpName: "BOLE TV RING",            incentiveCode: "BOLE TV RING",       notes: "" },
  { erpName: "FANCY RING",              incentiveCode: "FANCY RING",         notes: "" },
  { erpName: "MALABAR RING",            incentiveCode: "MALABAR RING",       notes: "" },
  // Studs / Mattal
  { erpName: "CASTING STUD",            incentiveCode: "CASTING STUD",       notes: "" },
  { erpName: "CBE STUD",                incentiveCode: "CBE STUD",           notes: "" },
  { erpName: "BABY STUD",               incentiveCode: "BABY STUD",          notes: "" },
  { erpName: "BOMBAY STUD",             incentiveCode: "BOMBAY STUD",        notes: "" },
  { erpName: "FANCY STUD",              incentiveCode: "FANCY STUD",         notes: "" },
  { erpName: "KUMKI STUD",              incentiveCode: "KUMKI STUD",         notes: "" },
  { erpName: "KASA STUD",               incentiveCode: "KASA STUD",          notes: "" },
  { erpName: "BOMMI STUD",              incentiveCode: "BOMMI STUD",         notes: "" },
  { erpName: "SIDE STUD",               incentiveCode: "SIDE STUD",          notes: "" },
  { erpName: "75K SIDE STUD",           incentiveCode: "SIDE STUD",          notes: "75K KDM" },
  { erpName: "FANCY JIMIKKI",           incentiveCode: "FANCY JIMIKKI",      notes: "" },
  { erpName: "JIMIKKI KAMMAL",          incentiveCode: "JIMIKKI KAMMAL",     notes: "" },
  { erpName: "JIMMIKI",                 incentiveCode: "JIMIKKI KAMMAL",     notes: "Alternate spelling" },
  { erpName: "DELHI MATTAL",            incentiveCode: "DELHI MATTAL",       notes: "" },
  { erpName: "BOMBAY MATTAL",           incentiveCode: "BOMBAY MATTAL",      notes: "" },
  { erpName: "FANCY MATTAL",            incentiveCode: "FANCY MATTAL",       notes: "" },
  { erpName: "CBE MATTAL",              incentiveCode: "CBE MATTAL",         notes: "" },
  { erpName: "TITANIC MATTAL",          incentiveCode: "BOMBAY MATTAL",      notes: "" },
  { erpName: "NAGMA STUD",              incentiveCode: "NAGMA STUD",         notes: "" },
  { erpName: "KERALA STUD",             incentiveCode: "KERALA STUD",        notes: "" },
  { erpName: "TURKEY STUD",             incentiveCode: "TURKEY STUD",        notes: "" },
  { erpName: "ROSE GOLD STUD",          incentiveCode: "ROSE GOLD STUD",     notes: "" },
  { erpName: "STONE STUD",              incentiveCode: "STONE STUD",         notes: "" },
  { erpName: "ANTIQUE STUD",            incentiveCode: "ANTIQUE STUD",       notes: "" },
  { erpName: "ANTIQUE JIMIKKI",         incentiveCode: "ANTIQUE JIMIKKI",    notes: "" },
  // Malai / Mala
  { erpName: "CBE MALAI",               incentiveCode: "CBE MALAI",          notes: "" },
  { erpName: "BOMBAY MALAI",            incentiveCode: "BOMBAY MALAI",       notes: "" },
  { erpName: "FANCY MALAI",             incentiveCode: "FANCY MALAI",        notes: "" },
  { erpName: "ANTIQUE MALAI",           incentiveCode: "ANTIQUE MALAI",      notes: "" },
  { erpName: "ANTIQUE LAKSHMI MALAI",   incentiveCode: "ANTIQUE MALAI",      notes: "" },
  { erpName: "KERALA MALAI",            incentiveCode: "KERALA MALAI",       notes: "" },
  { erpName: "LAKSHMI MALAI",           incentiveCode: "KERALA MALAI",       notes: "" },
  { erpName: "KASU MALAI",              incentiveCode: "KASU MALAI",         notes: "" },
  { erpName: "TURKEY MALAI",            incentiveCode: "TURKEY MALAI",       notes: "" },
  { erpName: "CASTING MALA",            incentiveCode: "CASTING MALA",       notes: "" },
  // Necklace / Choker
  { erpName: "ANTIQUE NECKLACE",        incentiveCode: "ANTIQUE NECKLACE",   notes: "" },
  { erpName: "BOMBAY NECKLACE",         incentiveCode: "BOMBAY NECKLACE",    notes: "" },
  { erpName: "CBE NECKLACE",            incentiveCode: "CBE NECKLACE",       notes: "" },
  { erpName: "CASTING NECKLACE",        incentiveCode: "CASTING NECKLACE",   notes: "" },
  { erpName: "FANCY NECKLACE",          incentiveCode: "FANCY NECKLACE",     notes: "" },
  { erpName: "TURKEY NECKLACE",         incentiveCode: "TURKEY NECKLACE",    notes: "" },
  { erpName: "KERALA NECKLACE",         incentiveCode: "KERALA NECKLACE",    notes: "" },
  { erpName: "ANTIQUE CHOKER",          incentiveCode: "ANTIQUE CHOKER",     notes: "" },
  { erpName: "BOMBAY CHOKER",           incentiveCode: "BOMBAY CHOKER",      notes: "" },
  // Dollar
  { erpName: "CASTING DOLLAR",          incentiveCode: "CASTING DOLLAR",     notes: "" },
  { erpName: "FANCY DOLLAR",            incentiveCode: "FANCY DOLLAR",       notes: "" },
  { erpName: "FISH DOLLAR",             incentiveCode: "FISH DOLLAR",        notes: "" },
  { erpName: "BOMBAY DOLLAR",           incentiveCode: "BOMBAY DOLLAR",      notes: "" },
  { erpName: "ROSE DOLLAR",             incentiveCode: "FANCY DOLLAR",       notes: "75 KDM" },
  { erpName: "LAKSHMI DOLLAR",          incentiveCode: "LAKSHMI DOLLAR",     notes: "" },
  { erpName: "MUGAPPU DOLLAR",          incentiveCode: "MUGAPPU DOLLAR",     notes: "" },
  // Thali items
  { erpName: "THALI",                   incentiveCode: "THALI",              notes: "" },
  { erpName: "MANI",                    incentiveCode: "MANI",               notes: "" },
  { erpName: "LAKSHMI KASU",            incentiveCode: "LAKSHMI KASU",       notes: "" },
  { erpName: "MANGA KASU",              incentiveCode: "MANGA KASU",         notes: "" },
  { erpName: "PLAIN THAYATTU",          incentiveCode: "PLAIN THAYATTU",     notes: "" },
  { erpName: "ROUND THAYATTU",          incentiveCode: "ROUND THAYATTU",     notes: "" },
  // Diamond
  { erpName: "DIAMOND BESARI",          incentiveCode: "DIAMOND BESARI",     notes: "" },
  { erpName: "DIAMOND STUD",            incentiveCode: "DIAMOND STUD",       notes: "" },
  { erpName: "DIAMOND RING",            incentiveCode: "DIAMOND RING",       notes: "" },
  { erpName: "DIAMOND NECKLACE",        incentiveCode: "DIAMOND NECKLACE",   notes: "" },
  { erpName: "DIA NECKLACE",            incentiveCode: "DIAMOND NECKLACE",   notes: "ERP short name" },
  // Zero incentive
  { erpName: "COINS",                   incentiveCode: "COINS",              notes: "Zero incentive" },
  { erpName: "PURE GOLD",               incentiveCode: "COINS",              notes: "Zero incentive" },
  { erpName: "PEARL STONE",             incentiveCode: "COINS",              notes: "Zero incentive" },
  { erpName: "SILVER COIN",             incentiveCode: "SB",                 notes: "Zero incentive" },
  { erpName: "PURE SILVER",             incentiveCode: "SB",                 notes: "Zero incentive" },
  // Silver items (S code)
  { erpName: "S",                       incentiveCode: "S",                  notes: "" },
  { erpName: "SILVER CHAIN",            incentiveCode: "S",                  notes: "" },
  { erpName: "SILVER METTI",            incentiveCode: "S",                  notes: "Toe ring" },
  { erpName: "SILVER KODI",             incentiveCode: "S",                  notes: "" },
  { erpName: "SILVER OMT",              incentiveCode: "S",                  notes: "" },
  { erpName: "SILVER KADA",             incentiveCode: "S",                  notes: "" },
  { erpName: "SILVER THANDAI",          incentiveCode: "S",                  notes: "" },
  { erpName: "NAKASU THANDAI",          incentiveCode: "S",                  notes: "" },
  { erpName: "SILVER WATCH",            incentiveCode: "S",                  notes: "" },
  { erpName: "KUTHU VILAKKU",           incentiveCode: "S",                  notes: "Lamp" },
  { erpName: "AGAL VILAKU",             incentiveCode: "S",                  notes: "Lamp" },
  { erpName: "PAVALA MANI",             incentiveCode: "S",                  notes: "" },
  { erpName: "BANGLE",                  incentiveCode: "S",                  notes: "Silver bangle" },
  { erpName: "SILVER BANGLE",           incentiveCode: "S",                  notes: "" },
  { erpName: "BOMBAY KOLUSU-K",         incentiveCode: "S",                  notes: "Silver kolusu" },
  { erpName: "BOMBAY KOLUSU-S",         incentiveCode: "S",                  notes: "Silver kolusu" },
  { erpName: "K-KOTHU",                 incentiveCode: "S",                  notes: "Kothu kolusu" },
  { erpName: "K-MOGAPU",               incentiveCode: "S",                  notes: "Mogapu kolusu" },
  { erpName: "A-MOGAPU KOLUSU",         incentiveCode: "S",                  notes: "" },
  { erpName: "A-KOTHU KOLUSU",          incentiveCode: "S",                  notes: "" },
  { erpName: "UIREY KOLUSU",            incentiveCode: "S",                  notes: "" },
  { erpName: "K-SALANGAI 1",            incentiveCode: "S",                  notes: "Salangai" },
  // 92.5 Silver (weight decides S vs L: <20g = 92.5-S, >=20g = 92.5-L)
  { erpName: "92.5-S",                  incentiveCode: "92.5-S",             notes: "Weight decides S/L" },
  { erpName: "92.5-L",                  incentiveCode: "92.5-L",             notes: "" },
  { erpName: "92.5 CHAIN",              incentiveCode: "92.5-S",             notes: "Weight decides S/L" },
  { erpName: "92.5 BRACELET",           incentiveCode: "92.5-S",             notes: "Weight decides S/L" },
  { erpName: "92.5 SILVER RING",        incentiveCode: "92.5-S",             notes: "Weight decides S/L" },
  { erpName: "92.5 DOLLAR",             incentiveCode: "92.5-S",             notes: "Weight decides S/L" },
  { erpName: "92.5 BANGLE",             incentiveCode: "92.5-S",             notes: "Weight decides S/L" },
  { erpName: "92.5 KAPPU",              incentiveCode: "92.5-S",             notes: "Weight decides S/L" },
  { erpName: "92.5 STUD",              incentiveCode: "S",                  notes: "92.5 stud → S rate" },
  { erpName: "92.5 TEMPLE JEWEL",       incentiveCode: "92.5-S",             notes: "Weight decides S/L" },
  { erpName: "92.5 SILVER OMT",         incentiveCode: "92.5-S",             notes: "" },
  { erpName: "ANTIQUE METTI",           incentiveCode: "92.5-S",             notes: "Antique toe ring" },
  { erpName: "CASTING METTI",           incentiveCode: "92.5-S",             notes: "" },
  { erpName: "IDOL",                    incentiveCode: "92.5-S",             notes: "Silver idol" },
  // Gold kolusu
  { erpName: "GOLD KOLUSU",             incentiveCode: "GOLD KOLUSU",        notes: "" },
  { erpName: "SB",                      incentiveCode: "SB",                 notes: "" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────────

export function parseNum(s: string): number {
  const m = (s ?? "").match(/[-\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

export function parseErp(raw: string): CalcRow[] {
  const lines = raw.split("\n").map(l => l.trimEnd());
  const hi = lines.findIndex(l => /date/i.test(l) && /product/i.test(l) && /net.?wt/i.test(l));
  if (hi < 0) return [];
  const rows: CalcRow[] = [];
  let lastDate = "", lastCustomer = "", lastMobile = "", lastBillNo = "";
  lines.slice(hi + 1).forEach((line, i) => {
    if (!line.trim()) return;
    const c = line.split("\t");
    const product      = (c[1] ?? "").trim().toUpperCase();
    const productGroup = (c[2] ?? "").trim().toUpperCase();
    const netWt        = parseNum(c[8] ?? "");
    if (!product || netWt <= 0) return;
    // Carry forward bill-level fields — ERP only prints them on the first line of each bill
    const rawDate = (c[0] ?? "").trim();
    if (rawDate) { lastDate = rawDate; lastCustomer = (c[9] ?? "").trim(); lastMobile = (c[10] ?? "").trim(); lastBillNo = (c[11] ?? "").trim(); }
    const wastageField = (c[3] ?? "").trim();
    const isSilver   = /^(SILVER|92\.5)/i.test(productGroup);
    const isSideStud = /SIDE STUD/i.test(product);
    const isGrams    = /gm/i.test(wastageField);
    let wastage: number;
    if (isSilver || isSideStud) {
      // Silver and SIDE STUD don't need real VA% — force 1 so they always pass the min-wastage check
      wastage = 1;
    } else if (isGrams && netWt > 0) {
      // VA shown as weight (e.g. "0.400 Gm") — convert to % relative to net weight
      wastage = parseFloat(((parseNum(wastageField) / netWt) * 100).toFixed(2));
    } else {
      wastage = parseNum(wastageField);
    }
    rows.push({
      idx:      i,
      date:     lastDate,
      product,
      wastage,
      netWt,
      balance:  Math.max(0, parseNum(c[7] ?? "")),
      sp1:      (c[5] ?? "").trim(),
      sp2:      (c[6] ?? "").trim(),
      customer: lastCustomer,
      mobile:   lastMobile,
      billNo:   lastBillNo,
    });
  });
  return rows;
}

// Two-step lookup: ERP name → incentive code → master entry
export function lookupProduct(
  erpProduct: string, netWt: number,
  mapper: MapperEntry[], master: MasterEntry[]
): { masterEntry: MasterEntry | null; incentiveCode: string; mapped: boolean } {
  const mapEntry = mapper.find(m => m.erpName.toUpperCase() === erpProduct);
  const mapped   = !!mapEntry;
  let incentiveCode = (mapEntry?.incentiveCode ?? erpProduct).toUpperCase();
  // Weight-based 92.5 split: ≤20g = S, >20g = L
  if (incentiveCode === "92.5-S" && netWt > 20) incentiveCode = "92.5-L";
  const masterEntry = master.find(m => m.code.toUpperCase() === incentiveCode) ?? null;
  return { masterEntry, incentiveCode, mapped };
}

export function calcRow(
  row: CalcRow, ov: RowOverride | undefined, defaultSplit: number,
  mapper: MapperEntry[], master: MasterEntry[]
) {
  const { masterEntry, incentiveCode, mapped } = lookupProduct(row.product, row.netWt, mapper, master);
  const masterRate = masterEntry?.rate ?? 0;
  const rate       = ov?.rateOverride ?? masterRate;
  const minWastage = ov?.minWastage ?? masterEntry?.minWastage ?? 0;
  const balance    = ov?.balanceZero ? 0 : row.balance;
  const sp1Share   = ov?.sp1Share   ?? defaultSplit;
  const wastage    = ov?.wastage    ?? row.wastage;
  const eligible   = !ov?.forceIneligible && !!masterEntry && rate > 0 && wastage >= minWastage && balance <= 0;
  // Recovery multiplier: when a write-off exists, incentive scales to the recovered fraction
  const recoveryPct = ov?.writeOffAmt && ov.writeOffAmt > 0
    ? parseFloat((((ov.amountPaid ?? 0) / ((ov.amountPaid ?? 0) + ov.writeOffAmt)) * 100).toFixed(1))
    : 100;
  // Effective VA% after write-off: original VA% × recovery%
  // If board rate provided: also compute MC lost in ₹ = netWt × boardRate × VA%/100 × (1 - recovery%/100)
  const effectiveVA = recoveryPct < 100 ? parseFloat((wastage * recoveryPct / 100).toFixed(2)) : wastage;
  const mcLost      = (ov?.boardRate && ov.writeOffAmt && ov.writeOffAmt > 0)
    ? parseFloat((row.netWt * ov.boardRate * wastage / 100 * (1 - recoveryPct / 100)).toFixed(2))
    : null;
  const perSale    = masterEntry?.perSale ?? false;
  const fullInc    = eligible ? (perSale ? rate : parseFloat((rate * row.netWt).toFixed(2))) : 0;
  const totalInc   = parseFloat((fullInc * recoveryPct / 100).toFixed(2));
  const sp1Inc     = row.sp2 ? parseFloat((totalInc * sp1Share / 100).toFixed(2)) : totalInc;
  const sp2Inc     = row.sp2 ? parseFloat((totalInc * (100 - sp1Share) / 100).toFixed(2)) : 0;
  return { rate, masterRate, minWastage, balance, sp1Share, wastage, eligible, fullInc, totalInc, recoveryPct, effectiveVA, mcLost, sp1Inc, sp2Inc, incentiveCode, mapped, perSale };
}

export interface SavedSheet {
  raw_data: string;
  overrides?: Record<number, RowOverride> | null;
  deleted_idxs?: number[] | null;
  default_split?: number | null;
  mapper_entries?: MapperEntry[] | null;
  master_entries?: MasterEntry[] | null;
}

// Same merge rules as loading a sheet in the calculator: new INITIAL_MAPPER entries
// are added, perSale flags come from INITIAL_MASTER (not persisted), deleted rows dropped
export function loadSavedSheet(d: SavedSheet) {
  const saved = d.mapper_entries;
  const savedNames = new Set((saved ?? []).map(m => m.erpName.toUpperCase()));
  const mapper = saved
    ? [...saved, ...INITIAL_MAPPER.filter(m => !savedNames.has(m.erpName.toUpperCase()))]
    : INITIAL_MAPPER;
  const master = d.master_entries
    ? d.master_entries.map(e => {
        const init = INITIAL_MASTER.find(m => m.code === e.code);
        return init?.perSale ? { ...e, perSale: true } : e;
      })
    : INITIAL_MASTER;
  const deleted = d.deleted_idxs ?? [];
  const rows = parseErp(d.raw_data ?? "").filter(r => !deleted.includes(r.idx));
  return { rows, overrides: d.overrides ?? {}, defaultSplit: d.default_split ?? 70, mapper, master, deleted };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Sheet periods are free text ("October 2026", "Oct 2026") — returns "YYYY-MM" or null
export function periodToMonth(period: string): string | null {
  const p = period.toLowerCase();
  const year = p.match(/\b(20\d{2})\b/)?.[1];
  const mi = MONTHS.findIndex(m => p.includes(m));
  return year && mi >= 0 ? `${year}-${String(mi + 1).padStart(2, "0")}` : null;
}
