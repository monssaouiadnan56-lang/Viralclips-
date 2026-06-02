import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface AuthenticatedUser {
  id: string;
  email?: string;
}

interface VideoAccess {
  id: string;
  user_id: string;
  source_url: string;
  title: string | null;
  status: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function getServiceSupabase() {
  return supabase;
}

export async function requireUser(request: Request): Promise<AuthenticatedUser> {
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    throw new ApiError('No autorizado', 401);
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new ApiError('No autorizado', 401);
  }

  return { id: user.id, email: user.email };
}

export async function requireActiveProPlan(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .select('subscription_status, plan_name')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new ApiError('No se pudo verificar la suscripcion', 500);
  }

  if (data?.subscription_status !== 'active' || data.plan_name !== 'pro') {
    throw new ApiError('Plan Pro requerido', 402);
  }
}

export async function requireOwnedVideo(videoId: string, userId: string): Promise<VideoAccess> {
  const { data, error } = await supabase
    .from('videos')
    .select('id, user_id, source_url, title, status')
    .eq('id', videoId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    throw new ApiError('Video no encontrado', 404);
  }

  return data as VideoAccess;
}
