import crawlerPipeline from "../../../docs/images/crawler-pipeline.png";
import mainArchitecture from "../../../docs/images/main-architecture.png";
import oneCrawl from "../../../docs/images/one-crawl.png";
import problem from "../../../docs/images/problem.png";

export const diagrams = {
  problem: { src: problem, width: 1496, height: 560 },
  "main-architecture": { src: mainArchitecture, width: 2982, height: 1788 },
  "one-crawl": { src: oneCrawl, width: 2282, height: 2336 },
  "crawler-pipeline": { src: crawlerPipeline, width: 4138, height: 1192 },
};

export type DiagramName = keyof typeof diagrams;

/** Rectangles in the pixels of the exported PNG, so a region survives any resize of the slide. */
export const regions = {
  app: { diagram: "main-architecture", x: 1075, y: 10, w: 340, h: 290 },
  queue: { diagram: "main-architecture", x: 1140, y: 580, w: 270, h: 290 },
  worker: { diagram: "main-architecture", x: 1740, y: 580, w: 340, h: 290 },
  crawl: { diagram: "main-architecture", x: 1140, y: 580, w: 940, h: 290 },
  storage: { diagram: "main-architecture", x: 2340, y: 430, w: 380, h: 670 },
  crawler: { diagram: "main-architecture", x: 1140, y: 212, w: 1580, h: 978 },
  openrouter: { diagram: "main-architecture", x: 1740, y: 190, w: 300, h: 140 },
  monitor: { diagram: "main-architecture", x: 650, y: 1250, w: 750, h: 310 },
  "dead-letter": {
    diagram: "main-architecture",
    x: 60,
    y: 590,
    w: 800,
    h: 310,
  },
  "crawl-start": { diagram: "one-crawl", x: 0, y: 0, w: 2282, h: 1110 },
  "crawl-middle": { diagram: "one-crawl", x: 0, y: 610, w: 2282, h: 1110 },
  "crawl-finish": { diagram: "one-crawl", x: 0, y: 1226, w: 2282, h: 1110 },
} satisfies Record<
  string,
  { diagram: DiagramName; x: number; y: number; w: number; h: number }
>;

export type RegionName = keyof typeof regions;
