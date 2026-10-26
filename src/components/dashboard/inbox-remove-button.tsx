'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { removeInboxItem, type InboxRemoveKind } from '@/lib/inbox-hidden';

export function InboxRemoveButton({
  kind,
  id,
  accessToken,
  userId,
  onRemoved,
  label = 'Remove',
}: {
  kind: InboxRemoveKind;
  id: string;
  accessToken: string | null | undefined;
  userId: string | null | undefined;
  onRemoved: () => void;
  label?: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-8 rounded-md text-xs"
      disabled={busy || !accessToken || !userId}
      onClick={async (event) => {
        event.stopPropagation();
        if (!accessToken || !userId) return;
        if (!window.confirm('Remove this request from your inbox? Pending items are withdrawn.')) {
          return;
        }
        setBusy(true);
        const result = await removeInboxItem({ accessToken, userId, kind, id });
        setBusy(false);
        if (!result.ok) {
          toast({
            title: 'Could not remove',
            description: result.error,
            variant: 'destructive',
          });
          return;
        }
        toast({ title: 'Removed', description: 'This request is no longer in your inbox.' });
        onRemoved();
      }}
    >
      {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}
