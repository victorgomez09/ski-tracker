import api from '../interceptor/api';
import { API_BASE_URL } from '../constants/constants';
import { CreateMeetingPointDto, MeetingPoint } from '../models/meeting-point.model';

export const meetingPointService = {
    async list(resortId?: string): Promise<MeetingPoint[]> {
        const params: Record<string, string> = {};
        if (resortId) params.resort_id = resortId;
        const res = await api.get(`${API_BASE_URL}/meeting-points`, { params });
        return res.data || [];
    },

    async getById(id: string): Promise<MeetingPoint> {
        const res = await api.get(`${API_BASE_URL}/meeting-points/${id}`);
        return res.data;
    },

    async create(dto: CreateMeetingPointDto): Promise<MeetingPoint> {
        const res = await api.post(`${API_BASE_URL}/meeting-points`, dto);
        return res.data;
    },

    async delete(id: string): Promise<void> {
        await api.delete(`${API_BASE_URL}/meeting-points/${id}`);
    },
};
