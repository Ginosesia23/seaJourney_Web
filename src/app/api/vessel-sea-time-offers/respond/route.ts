import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * POST: Crew member accepts or rejects a vessel sea time offer.
 * On accept, vessel's daily_state_logs for the date range are copied to the crew (same as crew-requested sea time).
 */
export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { offerId, action, preserveCrewLogs } = body; // action: 'accept' | 'reject'

    if (!offerId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: offerId, action' },
        { status: 400 }
      );
    }

    if (action !== 'accept' && action !== 'reject') {
      return NextResponse.json(
        { error: 'Action must be "accept" or "reject"' },
        { status: 400 }
      );
    }

    const { data: offer, error: offerError } = await supabaseAdmin
      .from('vessel_sea_time_offers')
      .select('*')
      .eq('id', offerId)
      .eq('status', 'pending')
      .eq('crew_user_id', user.id)
      .single();

    if (offerError || !offer) {
      return NextResponse.json(
        { error: 'Offer not found or already responded to' },
        { status: 404 }
      );
    }

    const updateData = {
      status: action === 'accept' ? 'accepted' : 'rejected',
      updated_at: new Date().toISOString(),
    };

    const { data: updatedOffer, error: updateError } = await supabaseAdmin
      .from('vessel_sea_time_offers')
      .update(updateData)
      .eq('id', offerId)
      .select()
      .single();

    if (updateError) {
      console.error('[VESSEL SEA TIME OFFER] Error updating offer:', updateError);
      return NextResponse.json(
        { error: 'Failed to update offer', details: updateError.message },
        { status: 500 }
      );
    }

    if (action === 'accept') {
      try {
        const vesselUserId = offer.vessel_user_id;
        const crewUserId = offer.crew_user_id;
        const vesselId = offer.vessel_id;
        const startDate = offer.start_date;
        const endDate = offer.end_date;

        let vesselLogs: any[] = [];
        let logsError: any = null;

        const { data: logsWithDate, error: dateError } = await supabaseAdmin
          .from('daily_state_logs')
          .select('date, state')
          .eq('vessel_id', vesselId)
          .eq('user_id', vesselUserId)
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: true });

        if (dateError && (dateError.message?.includes('column "date"') || dateError.code === '42703')) {
          const { data: logsWithLogDate, error: logDateError } = await supabaseAdmin
            .from('daily_state_logs')
            .select('log_date, state')
            .eq('vessel_id', vesselId)
            .eq('user_id', vesselUserId)
            .gte('log_date', startDate)
            .lte('log_date', endDate)
            .order('log_date', { ascending: true });

          if (logDateError) {
            logsError = logDateError;
          } else {
            vesselLogs = logsWithLogDate || [];
          }
        } else if (dateError) {
          logsError = dateError;
        } else {
          vesselLogs = logsWithDate || [];
        }

        if (logsError) {
          console.error('[VESSEL SEA TIME OFFER] Error fetching vessel logs:', logsError);
          return NextResponse.json({
            success: true,
            offer: updatedOffer,
            warning: 'Offer accepted but logs could not be fetched',
          });
        }

        if (vesselLogs && vesselLogs.length > 0) {
          let logsToInsert: { user_id: string; vessel_id: string; date: string; state: string }[];

          if (preserveCrewLogs) {
            let existingDates = new Set<string>();
            const { data: existingByDate, error: existingDateError } = await supabaseAdmin
              .from('daily_state_logs')
              .select('date')
              .eq('user_id', crewUserId)
              .eq('vessel_id', vesselId)
              .gte('date', startDate)
              .lte('date', endDate);

            if (!existingDateError && existingByDate?.length) {
              existingDates = new Set((existingByDate as any[]).map((row: any) => String(row.date)));
            } else if (existingDateError && (existingDateError.code === '42703' || existingDateError.message?.includes('column "date"'))) {
              const { data: existingByLogDate } = await supabaseAdmin
                .from('daily_state_logs')
                .select('log_date')
                .eq('user_id', crewUserId)
                .eq('vessel_id', vesselId)
                .gte('log_date', startDate)
                .lte('log_date', endDate);
              if (existingByLogDate?.length) {
                existingDates = new Set((existingByLogDate as any[]).map((row: any) => String(row.log_date)));
              }
            }
            logsToInsert = vesselLogs
              .filter((log: any) => {
                const d = log.date || log.log_date;
                return d && !existingDates.has(String(d));
              })
              .map((log: any) => ({
                user_id: crewUserId,
                vessel_id: vesselId,
                date: log.date || log.log_date,
                state: log.state,
              }));
          } else {
            logsToInsert = vesselLogs.map((log: any) => ({
              user_id: crewUserId,
              vessel_id: vesselId,
              date: log.date || log.log_date,
              state: log.state,
            }));
          }

          if (logsToInsert.length === 0 && preserveCrewLogs) {
            return NextResponse.json({
              success: true,
              offer: updatedOffer,
              logsCopied: 0,
              message: 'Offer accepted. No new days copied because you already have logs for all dates in this range.',
            });
          }

          const { error: insertError } = await supabaseAdmin
            .from('daily_state_logs')
            .upsert(logsToInsert, {
              onConflict: 'user_id,vessel_id,date',
            });

          if (insertError) {
            console.error('[VESSEL SEA TIME OFFER] Error copying logs:', insertError);
            return NextResponse.json({
              success: true,
              offer: updatedOffer,
              warning: 'Offer accepted but some logs could not be copied',
            });
          }

          return NextResponse.json({
            success: true,
            offer: updatedOffer,
            logsCopied: logsToInsert.length,
          });
        }

        return NextResponse.json({
          success: true,
          offer: updatedOffer,
          warning: 'Offer accepted but no vessel logs were found for this date range',
        });
      } catch (logError: any) {
        console.error('[VESSEL SEA TIME OFFER] Exception copying logs:', logError);
        return NextResponse.json({
          success: true,
          offer: updatedOffer,
          warning: 'Offer accepted but logs could not be copied',
        });
      }
    }

    return NextResponse.json({ success: true, offer: updatedOffer });
  } catch (error: any) {
    console.error('[VESSEL SEA TIME OFFER] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}
