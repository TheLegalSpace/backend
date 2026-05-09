import { supabase } from "../config/supabase";
import { response, badRequest } from "../helpers/utility";
import { Response } from "../interface";
import { getSettings, updateSettings } from "../dao/settings";

export const _getSettings = async (accountId: string): Promise<Response> => {
  const settings = await getSettings(accountId);
  return response({ error: false, message: "Settings retrieved", data: settings });
};

export const _updateSettings = async (
  accountId: string,
  data: any
): Promise<Response> => {
  const settings = await updateSettings(accountId, data);
  return response({ error: false, message: "Settings updated", data: settings });
};

export const _changePassword = async (
  accessToken: string,
  newPassword: string
): Promise<Response> => {
  if (!newPassword || newPassword.length < 8) throw badRequest("Password too short");
  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData?.user) throw new Error("Invalid session");
  const { error } = await supabase.auth.updateUser(
    { password: newPassword },
    {} as any
  );
  if (error) throw new Error(error.message);
  return response({ error: false, message: "Password updated" });
};
