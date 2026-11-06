-- Up Migration
-- KPI "Total Followers" (Post-UAT Revision Brief, slide "KPI - Add Metrics").
--
-- DIBANGUN DARI DEFINISI YANG HIDUP DI DB (pg_get_functiondef, 2026-11-05), BUKAN
-- dari 057: warehouse sudah mengganti run rate menjadi pro-rata per bulan dan
-- run rate = achievement untuk metrik rasio. Menyalin 057 akan membatalkannya.
--
-- Total Followers adalah POSISI: capaiannya = follower_count_eod terakhir di
-- jendela KPI per akun, dijumlah antar akun platform itu — bukan SUM harian.
-- Karena tidak menumpuk, run rate-nya = achievement (seperti metrik rasio).
-- Selebihnya identik dengan definisi di DB.
CREATE OR REPLACE PROCEDURE l2_gold.sp_calculate_kpi_achievement(IN p_kpi_id uuid DEFAULT NULL::uuid)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_kpi              public.kpi_setting%ROWTYPE;
    v_platform_key     text;
    v_today            date := current_date;
    v_period_end       date;
    v_total_days       int;
    v_days_elapsed     int;
    v_total_months     int;
    v_months_elapsed   int;
    v_achieved         numeric;
    v_achievement_rate numeric;
    v_prorated_target  numeric;
    v_run_rate         numeric;
    v_is_rate_metric   boolean;
    v_found_any        boolean := false;
BEGIN
    FOR v_kpi IN
        SELECT * FROM public.kpi_setting
        WHERE (p_kpi_id IS NOT NULL AND kpi_id = p_kpi_id)
           OR (p_kpi_id IS NULL AND is_active)
    LOOP
        v_found_any := true;

        IF v_kpi.metrics_target NOT IN (
            -- harian (brand_metric_daily)
            'followers_growth', 'total_followers', 'engagement', 'reach', 'impressions',
            'views', 'video_views', 'likes', 'comments', 'shares', 'saves', 'post_count',
            'profile_visits', 'profile_reach', 'new_followers', 'link_clicks',
            -- per post (post_metric)
            'er_reach', 'avg_er_reach', 'er_views', 'avg_er_views',
            'avg_engagement', 'avg_reach', 'avg_views',
            'avg_likes', 'avg_comments', 'avg_shares', 'avg_saves'
        ) THEN
            RAISE EXCEPTION 'Unsupported metrics_target: % (extend l2_gold.sp_calculate_kpi_achievement to add it)', v_kpi.metrics_target;
        END IF;

        SELECT key INTO v_platform_key FROM public.platforms WHERE id = v_kpi.platform_id;
        IF v_platform_key IS NULL THEN
            RAISE EXCEPTION 'platform_id % not found in public.platforms', v_kpi.platform_id;
        END IF;

        v_total_days   := (v_kpi.end_date - v_kpi.start_date) + 1;
        v_period_end   := LEAST(v_today, v_kpi.end_date);
        v_days_elapsed := GREATEST(0, v_period_end - v_kpi.start_date + 1);

        -- Basis bulan kalender (year*12 + month), bukan estimasi 30 hari/bulan.
        v_total_months   := (EXTRACT(YEAR FROM v_kpi.end_date)::int * 12 + EXTRACT(MONTH FROM v_kpi.end_date)::int)
                           - (EXTRACT(YEAR FROM v_kpi.start_date)::int * 12 + EXTRACT(MONTH FROM v_kpi.start_date)::int)
                           + 1;
        v_months_elapsed := GREATEST(0,
                               (EXTRACT(YEAR FROM v_period_end)::int * 12 + EXTRACT(MONTH FROM v_period_end)::int)
                             - (EXTRACT(YEAR FROM v_kpi.start_date)::int * 12 + EXTRACT(MONTH FROM v_kpi.start_date)::int)
                             + 1
                           );

        v_is_rate_metric := v_kpi.metrics_target IN (
            'er_reach', 'avg_er_reach', 'er_views', 'avg_er_views',
            'avg_engagement', 'avg_reach', 'avg_views',
            'avg_likes', 'avg_comments', 'avg_shares', 'avg_saves'
        );

        IF v_kpi.metrics_target = 'total_followers' THEN
            -- Posisi, bukan jumlah: follower EOD terakhir di jendela per akun,
            -- dijumlah antar akun platform itu. Sama dengan kpiTargetQuery.
            SELECT COALESCE(SUM(last_eod), 0)
            INTO v_achieved
            FROM (
                SELECT DISTINCT ON (account_id) follower_count_eod AS last_eod
                FROM l2_gold.brand_metric_daily
                WHERE brand_id = v_kpi.brand_id
                  AND platform = v_platform_key
                  AND metric_date BETWEEN v_kpi.start_date AND v_period_end
                  AND (v_kpi.social_account_id IS NULL OR account_id = v_kpi.social_account_id)
                  AND follower_count_eod IS NOT NULL
                ORDER BY account_id, metric_date DESC
            ) x;
        ELSIF v_is_rate_metric THEN
            -- post_metric.brand_id = social_accounts.id → naik ke brand lewat
            -- brand_social_accounts (kpi_setting.brand_id = public.brands.id).
            SELECT COALESCE(
                CASE v_kpi.metrics_target
                    WHEN 'er_reach'       THEN SUM(p.engagement_owned) FILTER (WHERE p.reach > 0)::numeric
                                               / NULLIF(SUM(p.reach) FILTER (WHERE p.reach > 0), 0) * 100
                    WHEN 'avg_er_reach'   THEN AVG(p.er_reach) * 100
                    WHEN 'er_views'       THEN SUM(p.engagement_owned) FILTER (WHERE p.views > 0)::numeric
                                               / NULLIF(SUM(p.views) FILTER (WHERE p.views > 0), 0) * 100
                    WHEN 'avg_er_views'   THEN AVG(p.er_views) * 100
                    WHEN 'avg_engagement' THEN SUM(p.engagement_owned)::numeric / NULLIF(COUNT(*), 0)
                    WHEN 'avg_reach'      THEN SUM(p.reach)::numeric            / NULLIF(COUNT(*), 0)
                    WHEN 'avg_views'      THEN SUM(p.views)::numeric            / NULLIF(COUNT(*), 0)
                    WHEN 'avg_likes'      THEN SUM(p.likes)::numeric            / NULLIF(COUNT(*), 0)
                    WHEN 'avg_comments'   THEN SUM(p.comments)::numeric         / NULLIF(COUNT(*), 0)
                    WHEN 'avg_shares'     THEN SUM(p.shares)::numeric           / NULLIF(COUNT(*), 0)
                    WHEN 'avg_saves'      THEN SUM(p.saves)::numeric            / NULLIF(COUNT(*), 0)
                END, 0)
            INTO v_achieved
            FROM l2_gold.post_metric p
            JOIN public.brand_social_accounts bsa ON bsa.social_account_id = p.brand_id
            WHERE bsa.brand_id = v_kpi.brand_id
              AND p.platform = v_platform_key
              AND p.post_date::date BETWEEN v_kpi.start_date AND v_period_end
              AND (v_kpi.social_account_id IS NULL OR p.brand_id = v_kpi.social_account_id);
            v_achieved := ROUND(v_achieved, 2);
        ELSE
            SELECT COALESCE(
                CASE v_kpi.metrics_target
                    WHEN 'followers_growth' THEN SUM(net_growth_sum)
                    WHEN 'engagement'       THEN SUM(engagement_sum)
                    WHEN 'reach'            THEN SUM(reach_sum)
                    WHEN 'impressions'      THEN SUM(impressions_sum)
                    WHEN 'views'            THEN SUM(views_sum)
                    WHEN 'video_views'      THEN SUM(video_views_sum)
                    WHEN 'likes'            THEN SUM(likes_sum)
                    WHEN 'comments'         THEN SUM(comments_sum)
                    WHEN 'shares'           THEN SUM(shares_sum)
                    WHEN 'saves'            THEN SUM(saves_sum)
                    WHEN 'post_count'       THEN SUM(post_count)
                    WHEN 'profile_visits'   THEN SUM(profile_visit_sum)
                    WHEN 'profile_reach'    THEN SUM(profile_reach_sum)
                    WHEN 'new_followers'    THEN SUM(new_followers_sum)
                    WHEN 'link_clicks'      THEN SUM(link_clicks_sum)
                END, 0)
            INTO v_achieved
            FROM l2_gold.brand_metric_daily
            WHERE brand_id = v_kpi.brand_id
              AND platform = v_platform_key
              AND metric_date BETWEEN v_kpi.start_date AND v_period_end
              AND (v_kpi.social_account_id IS NULL OR account_id = v_kpi.social_account_id);
        END IF;

        v_achievement_rate := ROUND(v_achieved / NULLIF(v_kpi.value_target, 0) * 100, 2);

        IF v_is_rate_metric OR v_kpi.metrics_target = 'total_followers' THEN
            -- Total Followers juga posisi, bukan akumulasi — tidak diprorata.
            -- Metric rata-rata/rate: achieved tidak menumpuk seiring waktu,
            -- jadi target TIDAK diprorata -> run_rate = achievement_rate.
            v_run_rate := v_achievement_rate;
        ELSE
            -- Metric kumulatif (SUM harian): Run Rate (formula client) = actual
            -- vs target yang sudah diprorata sesuai BULAN berjalan (bukan hari):
            --   (Target / total_months) x months_elapsed
            v_prorated_target := v_kpi.value_target * v_months_elapsed / NULLIF(v_total_months, 0);
            v_run_rate         := ROUND(v_achieved / NULLIF(v_prorated_target, 0) * 100, 2);
        END IF;

        INSERT INTO l2_gold.kpi_achievement (kpi_id, achieved_value, value_target, achievement_rate, run_rate, computed_at)
        VALUES (v_kpi.kpi_id, v_achieved, v_kpi.value_target, v_achievement_rate, v_run_rate, now())
        ON CONFLICT (kpi_id) DO UPDATE SET
            achieved_value   = EXCLUDED.achieved_value,
            value_target     = EXCLUDED.value_target,
            achievement_rate = EXCLUDED.achievement_rate,
            run_rate         = EXCLUDED.run_rate,
            computed_at       = EXCLUDED.computed_at;
    END LOOP;

    IF p_kpi_id IS NOT NULL AND NOT v_found_any THEN
        RAISE EXCEPTION 'public.kpi_setting.kpi_id % not found', p_kpi_id;
    END IF;
END;
$procedure$;

-- Down Migration
-- Kembalikan definisi sebelumnya (isi Up tanpa cabang 'total_followers'). KPI
-- total_followers yang sudah tersimpan harus dihapus dulu, karena definisi lama
-- akan RAISE EXCEPTION untuk key itu.
