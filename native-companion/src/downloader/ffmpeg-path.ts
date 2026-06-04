import { existsSync } from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';

const staticPath = ffmpegStatic as unknown as string | null;
export const FFMPEG = staticPath && existsSync(staticPath) ? staticPath : 'ffmpeg';
