import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MultiSelect } from '@/shared/ui/multi-select';

/**
 * The server action reads this component's hidden inputs: `<name>All=on` for
 * All, otherwise one `<name>` per pick. The interactive toggling is checked in
 * the browser (see the spike doc); this pins the form contract on first render.
 */
const options = [
  { value: 'Sanur-Nusa Penida', label: 'Sanur → Nusa Penida' },
  { value: 'Padang Bai-Gili Trawangan', label: 'Padang Bai → Gili Trawangan' },
];

const render = (defaultValues: string[]) =>
  renderToStaticMarkup(
    createElement(MultiSelect, {
      id: 'routes',
      name: 'appliesToRouteCodes',
      options,
      defaultValues,
      allLabel: 'All routes',
      noun: 'routes',
    }),
  );

describe('MultiSelect first render', () => {
  it('starts on All when nothing is picked, and posts the All marker only', () => {
    const html = render([]);
    expect(html).toContain('name="appliesToRouteCodesAll"');
    expect(html).toContain('value="on"');
    expect(html).not.toContain('name="appliesToRouteCodes"');
    expect(html).toContain('All routes');
  });

  it('posts one input per picked value and names the pick', () => {
    const html = render(['Sanur-Nusa Penida']);
    expect(html).toContain('name="appliesToRouteCodes" value="Sanur-Nusa Penida"');
    expect(html).not.toContain('appliesToRouteCodesAll');
    expect(html).toContain('Sanur → Nusa Penida');
  });

  it('summarises several picks by count', () => {
    const html = render(['Sanur-Nusa Penida', 'Padang Bai-Gili Trawangan']);
    expect(html).toContain('2 routes selected');
    expect((html.match(/name="appliesToRouteCodes"/g) ?? []).length).toBe(2);
  });

  it('gives the trigger the id the label points at', () => {
    expect(render([])).toContain('id="routes"');
  });
});
