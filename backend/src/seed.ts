import fs from "fs/promises";
import path from "path";
import { pool } from "./db";
import { Indicator } from "../../shared/types";

async function seedIndicators() {
  const seedPath = path.resolve(process.cwd(), "db", "seed", "indicators.json");
  const raw = await fs.readFile(seedPath, "utf-8");
  const indicators = JSON.parse(raw) as Indicator[];

  for (const indicator of indicators) {
    await pool.query(
      "INSERT INTO indicators (id, name, acid_color, base_color, low, high) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, acid_color = EXCLUDED.acid_color, base_color = EXCLUDED.base_color, low = EXCLUDED.low, high = EXCLUDED.high",
      [
        indicator.id,
        indicator.name,
        indicator.acidColor,
        indicator.baseColor,
        indicator.low,
        indicator.high,
      ]
    );
  }

  console.log(`Seed completato: ${indicators.length} indicatori`);
}

seedIndicators()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error("Seed fallito", error);
    await pool.end();
    process.exit(1);
  });
