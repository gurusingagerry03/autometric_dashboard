-- Up Migration
-- KPI metrik tambahan (deck "Final Dashboard Revision", slide 9): ER Reach/Views
-- (pooled + rata-rata per post), rata-rata per post (engagement, reach, views,
-- likes, comments, shares, saves), plus profile visits, profile reach, new
-- followers, link clicks.
--
-- Metrik rasio & rata-rata dihitung dari l2_gold.post_metric, BUKAN dari
-- brand_metric_daily: engagement_sum di sana ikut menjumlah post tanpa reach,
-- sehingga ER pooled-nya tidak sama dengan yang dicetak tabel report
-- (metricsQuery.pooledER hanya menghitung post yang punya penyebut). post_metric
-- diverifikasi identik dengan l1_silver.unified_post (12 Okt 2026).
--
-- Satuan: ER = persen (5.25 = 5.25%), rata-rata = per post. Achievement tetap
-- achieved / target × 100 — target ER 5 dengan ER 4 = 80%.
--
-- Key lama tidak berubah, jadi KPI yang sudah tersimpan tetap terhitung sama.
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
    v_achieved         numeric;
    v_achievement_rate numeric;
    v_run_rate         numeric;
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
            'followers_growth', 'engagement', 'reach', 'impressions',
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

        IF v_kpi.metrics_target IN (
            'er_reach', 'avg_er_reach', 'er_views', 'avg_er_views',
            'avg_engagement', 'avg_reach', 'avg_views',
            'avg_likes', 'avg_comments', 'avg_shares', 'avg_saves'
        ) THEN
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
        v_run_rate          := ROUND(v_days_elapsed::numeric / NULLIF(v_total_days, 0) * 100, 2);

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
-- Kembalikan definisi sebelum 057 (11 key harian saja) dari git history bila perlu.
