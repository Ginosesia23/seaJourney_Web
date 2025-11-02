import { shopifyConfig } from './shopify-config';

export interface ShopifyProductVariant {
  id: string;
  title: string;
  availableForSale: boolean;
  price: {
    amount: string;
    currencyCode: string;
  };
  selectedOptions: {
    name: string;
    value: string;
  }[];
}

export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  description: string;
  priceRange: {
    minVariantPrice: {
      amount: string;
      currencyCode: string;
    };
  };
  images: {
    edges: {
      node: {
        url: string;
        altText: string | null;
      };
    }[];
  };
  variants: {
    edges: {
      node: ShopifyProductVariant;
    }[];
  };
  options: {
    id: string;
    name: string;
    values: string[];
  }[];
}

async function shopifyFetch(query: string, variables: Record<string, any> = {}) {
  const endpoint = `https://${shopifyConfig.storeDomain}/api/2024-04/graphql.json`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': shopifyConfig.storefrontAccessToken,
      },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store'
    });

    if (!response.ok) {
      console.error(`Shopify API response was not ok: ${response.statusText}`);
      return null;
    }

    const jsonResponse = await response.json();
    if (jsonResponse.errors) {
      console.error('Shopify GraphQL errors:', jsonResponse.errors);
      return null;
    }
    
    return jsonResponse.data;
  } catch (error) {
    console.error('Error fetching from Shopify:', error);
    return null;
  }
}

const getProductsQuery = `
  query getProducts($first: Int!) {
    products(first: $first) {
      edges {
        node {
          id
          title
          handle
          description
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          images(first: 1) {
            edges {
              node {
                url
                altText
              }
            }
          }
        }
      }
    }
  }
`;

const getProductByHandleQuery = `
  query getProductByHandle($handle: String!) {
    productByHandle(handle: $handle) {
      id
      title
      handle
      description
      descriptionHtml
      priceRange {
        minVariantPrice {
          amount
          currencyCode
        }
      }
      images(first: 5) {
        edges {
          node {
            url
            altText
          }
        }
      }
      options(first: 10) {
        id
        name
        values
      }
      variants(first: 250) {
        edges {
          node {
            id
            title
            availableForSale
            price {
              amount
              currencyCode
            }
            selectedOptions {
              name
              value
            }
          }
        }
      }
    }
  }
`;


export async function getProducts(count = 8): Promise<ShopifyProduct[]> {
  const data = await shopifyFetch(getProductsQuery, { first: count });
  return data?.products.edges.map((edge: { node: ShopifyProduct }) => edge.node) || [];
}

export async function getProductByHandle(handle: string): Promise<ShopifyProduct | null> {
  const data = await shopifyFetch(getProductByHandleQuery, { handle });
  return data?.productByHandle || null;
}
