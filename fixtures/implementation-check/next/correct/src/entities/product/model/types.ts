export type ProductImage = { src: string; alt: string };

export type Product = {
  id: string;
  price: number;
  discountRate: number;
  images: ProductImage[];
  options: string[];
  rating: number;
  reviewCount: number;
};
