import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's Stripe customer ID
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();

    if (userError) {
      console.error('[INVOICES API] Error fetching user:', userError);
      return NextResponse.json({ error: 'Failed to fetch user data' }, { status: 500 });
    }

    if (!userData?.stripe_customer_id) {
      // No Stripe customer ID means no invoices
      return NextResponse.json({ invoices: [] }, { status: 200 });
    }

    // Fetch invoices from Stripe
    const invoices = await stripe.invoices.list({
      customer: userData.stripe_customer_id,
      limit: 100, // Get up to 100 invoices
    });

    // Format invoices for display
    const formattedInvoices = invoices.data.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      amount: invoice.amount_paid || invoice.amount_due,
      currency: invoice.currency,
      status: invoice.status,
      date: invoice.created * 1000, // Convert to milliseconds
      periodStart: invoice.period_start ? invoice.period_start * 1000 : null,
      periodEnd: invoice.period_end ? invoice.period_end * 1000 : null,
      hostedInvoiceUrl: invoice.hosted_invoice_url,
      invoicePdf: invoice.invoice_pdf,
      description: invoice.description || invoice.lines?.data[0]?.description || 'Subscription',
    }));

    // Sort by date (newest first)
    formattedInvoices.sort((a, b) => b.date - a.date);

    return NextResponse.json({ invoices: formattedInvoices }, { status: 200 });
  } catch (error: any) {
    console.error('[INVOICES API] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}
