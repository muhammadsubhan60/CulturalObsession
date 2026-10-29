import { formatPkr } from '@co/shared';

export default function HomePage() {
  return (
    <main>
      <h1>Customized Jewellers</h1>
      <p>Storefront port in progress. Sample price: {formatPkr(99_900)}</p>
    </main>
  );
}
