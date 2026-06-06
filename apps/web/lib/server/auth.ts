import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _serviceClient: SupabaseClient | null = null;

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

export function getServiceSupabase(): SupabaseClient {
  if (!_serviceClient) {
    _serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _serviceClient;
}

export async function requireUser(request: Request): Promise<AuthenticatedUser> {
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    throw new ApiError('No autorizado', 401);
  }

  const { data: { user }, error } = await getServiceSupabase().auth.getUser(token);

  if (error || !user) {
    throw new ApiError('No autorizado', 401);
  }

  return { id: user.id, email: user.email };
}

export async function requireActiveProPlan(userId: string): Promise<void> {
  const { data, error } = await getServiceSupabase()
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

export async function requireUploadAccess(userId: string): Promise<void> {
  const { data, error } = await getServiceSupabase()
    .from('profiles')
    .select('subscription_status, plan_name')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new ApiError('No se pudo verificar la suscripcion', 500);

  const isPro = data?.subscription_status === 'active' && data.plan_name === 'pro';
  if (isPro) return;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count, error: countError } = await getServiceSupabase()
    .from('videos')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', todayStart.toISOString());

  if (countError) throw new ApiError('No se pudo verificar el límite diario', 500);

  if ((count ?? 0) >= 1) {
    throw new ApiError('Límite diario alcanzado. El plan gratuito permite 1 video por día. Actualiza a Pro para subir más.', 429);
  }
}

export async function requireOwnedVideo(videoId: string, userId: string): Promise<VideoAccess> {
  const { data, error } = await getServiceSupabase()
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
