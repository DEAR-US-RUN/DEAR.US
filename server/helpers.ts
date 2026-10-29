import type { PoolClient } from 'pg';
import { query } from './db';
import { missing } from './errors';
import { uuid } from './validation';
export async function member(diaryId: string, userId: string, client?:PoolClient) {
  if (!uuid.safeParse(diaryId).success) throw missing();
  const exec=client ? client.query.bind(client) : query;
  const r=await exec(`SELECT d.*,m.role FROM diaries d JOIN diary_members m ON m.diary_id=d.id
    WHERE d.id=$1 AND m.user_id=$2`,[diaryId,userId]);
  if (!r.rows[0]) throw missing();
  return r.rows[0];
}
export function streakFromDays(days:string[], now=new Date()):number {
  const dayMs=86_400_000;
  const today=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
  const values=new Set(days.map(d=>d.slice(0,10)));
  let cursor=today;
  if (!values.has(new Date(cursor).toISOString().slice(0,10))) cursor-=dayMs;
  let count=0;
  while(values.has(new Date(cursor).toISOString().slice(0,10))) {count++;cursor-=dayMs;}
  return count;
}
export async function diarySummary(diaryId:string,userId:string) {
  await member(diaryId,userId);
  const result=await query(`SELECT d.id,d.title,d.kind,d.relationship_label,d.other_name,d.target_mode,d.target_duration,d.target_date::text AS target_date,d.created_at,d.last_activity_at,
    cs.connected_at,cs.last_streak_break_at,v.unlocked_at,
    (SELECT coalesce(json_agg(json_build_object('id',u.id,'name',u.display_name,'avatar',u.avatar_url,'joinedAt',m.joined_at,'role',m.role) ORDER BY m.joined_at),'[]'::json)
      FROM diary_members m JOIN users u ON u.id=m.user_id WHERE m.diary_id=d.id) AS members,
    (SELECT coalesce(json_agg(a.user_id),'[]'::json) FROM vault_approvals a WHERE a.diary_id=d.id) AS approvals,
    (SELECT count(*)::int FROM published_entries e WHERE e.diary_id=d.id AND e.author_id=$2) AS my_entry_count,
    (SELECT coalesce(sum(mu.plaintext_size),0)::bigint FROM media_uploads mu WHERE mu.diary_id=d.id AND mu.author_id=$2 AND mu.state IN ('ready','published')) AS my_storage_bytes
    FROM diaries d LEFT JOIN connection_state cs ON cs.diary_id=d.id LEFT JOIN feelings_vault v ON v.diary_id=d.id WHERE d.id=$1`,[diaryId,userId]);
  const d=result.rows[0];
  const dayRows=await query(`SELECT DISTINCT (s.created_at AT TIME ZONE 'UTC')::date::text AS day FROM streak_events s
    JOIN connection_state c ON c.diary_id=s.diary_id
    WHERE s.diary_id=$1 AND s.event_type='publication' AND (c.last_streak_break_at IS NULL OR s.created_at>c.last_streak_break_at)
      ORDER BY day DESC`,[diaryId]);
  const today=new Date(); const todayMs=Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate());
  const remaining=d.target_date ? Math.round((Date.parse(String(d.target_date).slice(0,10)+'T00:00:00Z')-todayMs)/86_400_000) : null;
  return {
    id:d.id,title:d.title,kind:d.kind,relationshipLabel:d.relationship_label,otherName:d.other_name,
    targetMode:d.target_mode,targetDuration:d.target_duration,targetDate:d.target_date,remainingDays:remaining,
    createdAt:d.created_at,lastActivityAt:d.last_activity_at,members:d.members,connectedAt:d.connected_at,
    daysConnected:d.connected_at ? Math.max(0,Math.floor((Date.now()-new Date(d.connected_at).getTime())/86_400_000)) : null,
    approvals:d.approvals,unlockedAt:d.unlocked_at,myEntryCount:d.my_entry_count,myStorageBytes:Number(d.my_storage_bytes),
    streak:streakFromDays(dayRows.rows.map((r:any)=>r.day)),myId:userId,
  };
}
export async function audit(actorId:string|null,action:string,outcome:'success'|'failure',diaryId:string|null=null,detail:string|null=null) {
  await query('INSERT INTO audit_logs(actor_id,diary_id,action,outcome,detail) VALUES($1,$2,$3,$4,$5)',[actorId,diaryId,action,outcome,detail]);
}
