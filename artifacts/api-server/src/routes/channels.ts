import { Router, type IRouter } from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ListChannelsQueryParams,
  GetChannelParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const dataPath = path.resolve(process.cwd(), "data/channels.json");

function loadChannels() {
  const raw = readFileSync(dataPath, "utf-8");
  return JSON.parse(raw) as Array<{
    id: number;
    name: string;
    category: string;
    logo: string | null;
    stream: string;
    featured: boolean;
    description: string | null;
  }>;
}

router.get("/channels", (req, res) => {
  const parsed = ListChannelsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

  let channels = loadChannels();

  const { category, featured } = parsed.data;

  if (category) {
    channels = channels.filter(
      (c) => c.category.toLowerCase() === category.toLowerCase()
    );
  }

  if (featured !== undefined) {
    channels = channels.filter((c) => c.featured === featured);
  }

  res.json(channels);
});

router.get("/channels/categories", (_req, res) => {
  const channels = loadChannels();
  const categories = [...new Set(channels.map((c) => c.category))].sort();
  res.json(categories);
});

router.get("/channels/featured", (_req, res) => {
  const channels = loadChannels();
  const featured = channels.filter((c) => c.featured);
  res.json(featured);
});

router.get("/channels/stats", (_req, res) => {
  const channels = loadChannels();
  const categoryCounts: Record<string, number> = {};
  for (const ch of channels) {
    categoryCounts[ch.category] = (categoryCounts[ch.category] ?? 0) + 1;
  }
  res.json({
    total: channels.length,
    featured: channels.filter((c) => c.featured).length,
    categoryCounts,
  });
});

router.get("/channels/:id", (req, res) => {
  const parsed = GetChannelParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid channel ID" });
    return;
  }

  const channels = loadChannels();
  const channel = channels.find((c) => c.id === parsed.data.id);

  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  res.json(channel);
});

export default router;
