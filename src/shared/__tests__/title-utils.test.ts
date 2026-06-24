import { describe, it, expect } from 'vitest';
import { cleanPageTitle } from '@shared/title-utils';

describe('cleanPageTitle', () => {
  it('strips trailing site name after a dash', () => {
    expect(cleanPageTitle("Watch Marvel's Daredevil - S1E11 Online HD - Streamzy", 'streamzy.to')).toBe(
      "Watch Marvel's Daredevil - S1E11 Online HD",
    );
  });
  it('strips trailing site name after a pipe', () => {
    expect(cleanPageTitle('Big Buck Bunny | uzmovi', 'uzmovi.net')).toBe('Big Buck Bunny');
  });
  it('keeps title when last segment is not the site', () => {
    expect(cleanPageTitle('Episode 1 - The Beginning', 'streamzy.to')).toBe('Episode 1 - The Beginning');
  });
  it('handles no separator', () => {
    expect(cleanPageTitle('Just A Title', 'streamzy.to')).toBe('Just A Title');
  });
  it('ignores generic tld words', () => {
    // "com" alone should not be treated as a site word
    expect(cleanPageTitle('My Show - com', 'example.com')).toBe('My Show - com');
  });
  it('empty input -> empty', () => {
    expect(cleanPageTitle('', 'x.com')).toBe('');
    expect(cleanPageTitle(undefined, 'x.com')).toBe('');
  });
});
