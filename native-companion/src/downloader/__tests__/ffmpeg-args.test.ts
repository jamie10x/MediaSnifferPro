import { describe, it, expect } from 'vitest';
import { editArgs, titleMeta } from '../ffmpeg-runner';

describe('editArgs', () => {
  it('trim: clip duration with stream copy', () => {
    const a = editArgs({ op: 'trim', start: '00:00:05', end: '00:00:20' }).join(' ');
    expect(a).toContain('-t 15'); // 20 - 5
    expect(a).toContain('-c copy');
  });

  it('convert mkv/mp4: stream copy', () => {
    expect(editArgs({ op: 'convert', container: 'mkv' }).join(' ')).toContain('-c copy');
    expect(editArgs({ op: 'convert', container: 'mp4' }).join(' ')).toContain('-c copy');
  });
  it('convert webm: re-encode to vp9/opus', () => {
    const a = editArgs({ op: 'convert', container: 'webm' }).join(' ');
    expect(a).toContain('libvpx-vp9');
    expect(a).toContain('libopus');
  });

  it('compress: x264 with crf by level', () => {
    expect(editArgs({ op: 'compress', level: 'small' }).join(' ')).toContain('-crf 30');
    expect(editArgs({ op: 'compress', level: 'balanced' }).join(' ')).toContain('-crf 26');
  });

  it('audio: format-specific codec', () => {
    expect(editArgs({ op: 'audio', audioFormat: 'mp3' }).join(' ')).toContain('libmp3lame');
    expect(editArgs({ op: 'audio', audioFormat: 'flac' }).join(' ')).toContain('flac');
    expect(editArgs({ op: 'audio', audioFormat: 'm4a' }).join(' ')).toContain('-c:a copy');
    expect(editArgs({ op: 'audio', audioFormat: 'm4a' }).join(' ')).toContain('-vn');
  });
});

describe('titleMeta', () => {
  it('emits metadata when a title is given', () => {
    expect(titleMeta('Hello')).toEqual(['-metadata', 'title=Hello']);
  });
  it('emits nothing when absent', () => {
    expect(titleMeta(undefined)).toEqual([]);
  });
});
