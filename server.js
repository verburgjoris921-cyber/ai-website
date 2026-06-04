import express from "express";
import OpenAI from "openai";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import csv from "csv-parser";

dotenv.config();


const app = express();

app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

let recipes = [];

fs.createReadStream("./data/recipes.csv")
  .pipe(csv())
  .on("data", (row) => {
    recipes.push({
  ...row,
  maaltijdtype: row.maaltijdtype?.toLowerCase(),
  calorieen: Number(row.calorieen),
  eiwit: Number(row.eiwit),
  koolhydraten: Number(row.koolhydraten),
  vet: Number(row.vet),
});
  })
  .on("end", () => {
    console.log("✅ CSV geladen:", recipes.length, "recepten");
  });

let sessies = {};

app.post("/chat", async (req, res) => {
  try {
    const { message, profiel, sessionId } = req.body;

if (!sessionId) {
  return res.json({ reply: "SessionId ontbreekt." });
}

// ✅ ALS ER AL EEN PLANNING IS → DAN IS HET EEN WIJZIGING
if (sessies[sessionId] && message) {

  const vorigePlanning = sessies[sessionId];

  const aiResponse = await openai.responses.create({
    model: "gpt-5.4-mini",
    max_output_tokens: 400,
    input: `
Dit is de huidige maaltijdplanning:

${vorigePlanning}

De gebruiker zegt:
"${message}"

Pas alleen aan wat nodig is.
Geef de volledige bijgewerkte planning terug.
`
  });

  const nieuwePlanning = aiResponse.output_text?.trim();
  sessies[sessionId] = nieuwePlanning;

  return res.json({ reply: nieuwePlanning });
}

    // ====== NIEUWE PLANNING ======
    if (!profiel || !profiel.calorieen || !profiel.eiwit) {
      return res.json({ reply: "Profielgegevens ontbreken." });
    }

    const maaltijden = [
      { naam: "ontbijt", ratio: 0.25 },
      { naam: "lunch", ratio: 0.25 },
      { naam: "avondeten", ratio: 0.35 },
      { naam: "snack", ratio: 0.15 }
    ];

    let gekozenRecepten = [];

    maaltijden.forEach(maaltijd => {

      const targetKcal = profiel.calorieen * maaltijd.ratio;

      let opties = recipes.filter(r =>
        r.maaltijdtype === maaltijd.naam
      );

      if (opties.length === 0) return;

      // ✅ Slimste kcal match kiezen
      const besteMatch = opties.reduce((beste, r) => {
        const diff = Math.abs(r.calorieen - targetKcal);
        if (!beste) return r;
        const besteDiff = Math.abs(beste.calorieen - targetKcal);
        return diff < besteDiff ? r : beste;
      }, null);

      gekozenRecepten.push({
        maaltijd: maaltijd.naam,
        ...besteMatch
      });
    });

    // ====== MACRO'S LOKAAL BEREKENEN ======
    const totaal = gekozenRecepten.reduce((acc, r) => {
      acc.kcal += r.calorieen;
      acc.eiwit += r.eiwit;
      acc.koolhydraten += r.koolhydraten;
      acc.vet += r.vet;
      return acc;
    }, { kcal: 0, eiwit: 0, koolhydraten: 0, vet: 0 });

    // ====== COMPACTE DATA VOOR GPT ======
    const overzicht = gekozenRecepten.map(r =>
      `${r.maaltijd.toUpperCase()}
${r.naam}
${r.calorieen} kcal | ${r.eiwit}g eiwit`
    ).join("\n\n");

    const aiResponse = await openai.responses.create({
      model: "gpt-5.4-mini",
      max_output_tokens: 300,
      input: `
De gebruiker vraagt:
"${message || "Maak een maaltijdplanning voor vandaag"}"

Hier zijn de gekozen maaltijden:

${overzicht}

Totale macro's (berekend):
${Math.round(totaal.kcal)} kcal
${Math.round(totaal.eiwit)}g eiwit
${Math.round(totaal.koolhydraten)}g koolhydraten
${Math.round(totaal.vet)}g vet

Maak een nette, overzichtelijke planning.
Geef geen extra uitleg.
`
    });

    const planning = aiResponse.output_text?.trim();

    if (!planning) {
      return res.json({ reply: "AI kon geen planning genereren." });
    }

    sessies[sessionId] = planning;

    res.json({ reply: planning });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});
app.listen(3000, () => {
  console.log("Server draait op http://localhost:3000");
});