import { shopifyConfig } from './shopify-config';

export interface ShopifyProductVariant {
  id: string;
  title: string;
  availableForSale: boolean;
  price: {
    amount: string;
    currencyCode: string;
  };
  image: {
    url: string;
    altText: string | null;
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
  tags: string[];
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

export type CartItem = {
  variantId: string;
  quantity: number;
  title: string;
  price: string;
  image: string;
  variantTitle: string;
}

export interface ShopifyCheckout {
  id: string;
  webUrl: string;
  lineItems: {
    edges: {
      node: {
        id: string;
        quantity: number;
        title: string;
        variant: {
          id: string;
          title: string;
          price: {
            amount: string;
          };
          image: {
            url: string;
          }
        }
      }
    }[]
  }
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
          tags
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
      tags
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
            image {
              url
              altText
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

const createCheckoutMutation = `
  mutation checkoutCreate($input: CheckoutCreateInput!) {
    checkoutCreate(input: $input) {
      checkout {
        id
        webUrl
      }
      checkoutUserErrors {
        code
        field
        message
      }
    }
  }
`;

const checkoutLineItemsAddMutation = `
  mutation checkoutLineItemsAdd($checkoutId: ID!, $lineItems: [CheckoutLineItemInput!]!) {
    checkoutLineItemsAdd(checkoutId: $checkoutId, lineItems: $lineItems) {
      checkout {
        id
        webUrl
        lineItems(first: 250) {
          edges {
            node {
              id
              title
              quantity
              variant {
                id
                title
                price {
                  amount
                }
                image {
                  url
                }
              }
            }
          }
        }
      }
      checkoutUserErrors {
        code
        field
        message
      }
    }
  }
`;


export async function getProducts(count = 20): Promise<ShopifyProduct[]> {
  const data = await shopifyFetch(getProductsQuery, { first: count });
  return data?.products.edges.map((edge: { node: ShopifyProduct }) => edge.node) || [];
}

export async function getProductByHandle(handle: string): Promise<ShopifyProduct | null> {
  const data = await shopifyFetch(getProductByHandleQuery, { handle });
  return data?.productByHandle || null;
}

export async function createCheckout(lineItems: { variantId: string; quantity: number }[]): Promise<ShopifyCheckout | null> {
  const input = {
    lineItems,
  };
  const data = await shopifyFetch(createCheckoutMutation, { input });
  return data?.checkoutCreate?.checkout;
}

export async function addLineItems(checkoutId: string, lineItems: { variantId: string; quantity: number }[]): Promise<ShopifyCheckout | null> {
  const data = await shopifyFetch(checkoutLineItemsAddMutation, { checkoutId, lineItems });
  return data?.checkoutLineItemsAdd?.checkout;
}
