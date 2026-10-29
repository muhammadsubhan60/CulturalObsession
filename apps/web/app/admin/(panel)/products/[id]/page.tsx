import { ProductEditor } from './product-editor';

export const metadata = { title: 'Product' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductEditor productId={id === 'new' ? null : id} />;
}
