

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
  currencyCode: string;
  image: string;
  variantTitle: string;
}

export interface ShopifyCheckout {
  id: string;
  webUrl: string;
  completedAt: string | null;
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
            currencyCode: string;
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
      const errorBody = await response.text();
      console.error(`Error body: ${errorBody}`);
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
        completedAt
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
                  currencyCode
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

const checkoutLineItemsReplaceMutation = `
  mutation checkoutLineItemsReplace($checkoutId: ID!, $lineItems: [CheckoutLineItemInput!]!) {
    checkoutLineItemsReplace(checkoutId: $checkoutId, lineItems: $lineItems) {
      checkout {
         id
        webUrl
        completedAt
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
                  currencyCode
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


const getCheckoutQuery = `
  query getCheckout($id: ID!) {
    node(id: $id) {
      ... on Checkout {
        id
        webUrl
        completedAt
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
                  currencyCode
                }
                image {
                  url
                }
              }
            }
          }
        }
      }
    }
  }
`;


export async function getProducts(count = 250): Promise<ShopifyProduct[]> {
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
  if (data?.checkoutCreate?.checkoutUserErrors?.length > 0) {
    const errors = data.checkoutCreate.checkoutUserErrors;
    // Don't log error if it's just that the cart is empty.
    if (errors.length === 1 && errors[0].code === 'LINE_ITEMS_EMPTY') {
        // This is expected if cart is empty, do nothing.
    } else {
        console.error("Checkout Create Errors:", errors);
    }
  }
  return data?.checkoutCreate?.checkout;
}

export async function updateLineItems(checkoutId: string, lineItems: { variantId: string; quantity: number }[]): Promise<ShopifyCheckout | null> {
  const data = await shopifyFetch(checkoutLineItemsReplaceMutation, { checkoutId, lineItems });
  if (data?.checkoutLineItemsReplace?.checkoutUserErrors?.length > 0) {
    console.error("Checkout Update Errors:", data.checkoutLineItemsReplace.checkoutUserErrors);
  }
  return data?.checkoutLineItemsReplace?.checkout;
}

export async function getCheckout(id: string): Promise<ShopifyCheckout | null> {
  const data = await shopifyFetch(getCheckoutQuery, { id });
  return data?.node;
}
