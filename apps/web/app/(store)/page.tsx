import { Fragment } from 'react';
import { StoreChrome } from '@/components/store/chrome';
import { renderTheme } from '@/lib/theme/render';
import { sectionHtml } from '@/lib/theme/sections';

const HOME_SECTIONS = [
  'slideshow',
  '8177bac5-db42-4b9a-beee-fb432236f3c7',
  'b23aa4c7-34ae-4547-a9e0-859bbcc0056e',
  'collage',
  'image-with-text-0',
  'newsletter',
  'image-with-text-1',
  'multicolumn',
];

export default function HomePage() {
  return (
    <StoreChrome>
      {HOME_SECTIONS.map((name) => (
        <Fragment key={name}>{renderTheme(sectionHtml('home', name))}</Fragment>
      ))}
    </StoreChrome>
  );
}
