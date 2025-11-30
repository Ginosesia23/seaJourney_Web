'use client';

import { useState, useEffect } from 'react';
import {
  Query,
  onSnapshot,
  DocumentData,
  FirestoreError,
  QuerySnapshot,
  CollectionReference,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/** Utility type to add an 'id' field to a given type T. */
export type WithId<T> = T & { id: string };

/**
 * Interface for the return value of the useCollection hook.
 * @template T Type of the document data.
 */
export interface UseCollectionResult<T> {
  data: WithId<T>[] | null;              // Document data with ID, or null.
  isLoading: boolean;                    // True if loading.
  error: FirestoreError | Error | null;  // Error object, or null.
}

/* Internal implementation of Query:
  https://github.com/firebase/firebase-js-sdk/blob/c5f08a9bc5da0d2b0207802c972d53724ccef055/packages/firestore/src/lite-api/reference.ts#L143
*/
export interface InternalQuery extends Query<DocumentData> {
  _query: {
    path: {
      canonicalString(): string;
      toString(): string;
    };
  };
}

/**
 * React hook to subscribe to a Firestore collection or query in real-time.
 * Handles nullable references/queries.
 *
 * IMPORTANT! YOU MUST MEMOIZE the inputted memoizedTargetRefOrQuery or BAD THINGS WILL HAPPEN
 * Use useMemoFirebase (or React.useMemo) to memoize it per React guidance.
 *
 * @template T Optional type for document data. Defaults to any.
 * @param memoizedTargetRefOrQuery The Firestore CollectionReference or Query. Waits if null/undefined.
 * @returns {UseCollectionResult<T>} Object with data, isLoading, error.
 */
export function useCollection<T = any>(
  memoizedTargetRefOrQuery:
    | ((CollectionReference<DocumentData> | Query<DocumentData>) & { __memo?: boolean })
    | null
    | undefined,
): UseCollectionResult<T> {
  type ResultItemType = WithId<T>;
  type StateDataType = ResultItemType[] | null;

  const [data, setData] = useState<StateDataType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  useEffect(() => {
    // If no ref/query provided, reset state and do nothing
    if (!memoizedTargetRefOrQuery) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      memoizedTargetRefOrQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const results: ResultItemType[] = snapshot.docs.map((doc) => {
          return { ...(doc.data() as T), id: doc.id };
        });

        setData(results);
        setError(null);
        setIsLoading(false);
      },
      (firestoreError: FirestoreError) => {
        // Try to extract a useful path for debugging
        let path = 'unknown';

        try {
          if ((memoizedTargetRefOrQuery as any).type === 'collection') {
            path = (memoizedTargetRefOrQuery as CollectionReference).path;
          } else {
            path = (memoizedTargetRefOrQuery as unknown as InternalQuery)._query.path.canonicalString();
          }
        } catch {
          // fall back to toString if anything above fails
          try {
            path = String(
              (memoizedTargetRefOrQuery as any).path ??
                (memoizedTargetRefOrQuery as any)._query?.path?.toString?.() ??
                'unknown',
            );
          } catch {
            // ignore
          }
        }

        const contextualError = new FirestorePermissionError({
          operation: 'list', // this hook is always "listing" a collection/query
          path,
          cause: firestoreError,
        });

        setError(contextualError);
        setData(null);
        setIsLoading(false);

        // trigger global error propagation
        errorEmitter.emit('permission-error', contextualError);
      },
    );

    return () => unsubscribe();
  }, [memoizedTargetRefOrQuery]);

  // Enforce memoization contract to avoid resubscribing every render
  if (memoizedTargetRefOrQuery && !memoizedTargetRefOrQuery.__memo) {
    throw new Error(
      `${memoizedTargetRefOrQuery} was not properly memoized using useMemoFirebase (or an equivalent memoization helper).`,
    );
  }

  return { data, isLoading, error };
}
