import React, { useState, useEffect } from 'react';
import {
    ActivityIndicator,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Clock, Flag, MapPin, Users, X } from 'lucide-react-native';
import { BORDER_RADIUS, LIGHT_COLORS, SHADOWS, SPACING, useThemeColors } from '../../constants/theme';
import { useToast } from '../../context/toast.context';
import { meetingPointService } from '../../services/meeting-point.service';
import { socialService } from '../../services/social.service';
import { MeetingPoint } from '../../models/meeting-point.model';
import { Crew } from '../../models/social.model';

interface CreateMeetingPointModalProps {
    visible: boolean;
    resortId: string;
    resortName?: string;
    initialCoords: { latitude: number; longitude: number };
    initialTitle?: string;
    onClose: () => void;
    onCreated: (point: MeetingPoint) => void;
}

export const CreateMeetingPointModal: React.FC<CreateMeetingPointModalProps> = ({
    visible,
    resortId,
    resortName,
    initialCoords,
    initialTitle,
    onClose,
    onCreated,
}) => {
    const { t } = useTranslation();
    const colors = useThemeColors();
    const { showToast } = useToast();
    const styles = getStyles(colors);

    const [title, setTitle] = useState(initialTitle || '');
    const [meetTime, setMeetTime] = useState('');
    const [description, setDescription] = useState('');
    const [selectedCrewId, setSelectedCrewId] = useState<string | null>(null);
    const [crews, setCrews] = useState<Crew[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (visible) {
            setTitle(initialTitle || '');
            loadUserCrews();
            // Default time suggestion: e.g. 1 hour from now
            const now = new Date();
            now.setHours(now.getHours() + 1);
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = now.getMinutes() >= 30 ? '30' : '00';
            setMeetTime(`${hh}:${mm}`);
        }
    }, [visible, initialTitle]);

    const loadUserCrews = async () => {
        try {
            const userCrews = await socialService.listUserCrews();
            setCrews(userCrews || []);
        } catch {
            // Non-blocking
        }
    };

    const handleCreate = async () => {
        if (!title.trim()) {
            showToast(t('meeting_point_title_required', 'Indica un título para el punto de encuentro'), 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            const created = await meetingPointService.create({
                resort_id: resortId,
                title: title.trim(),
                meet_time: meetTime.trim(),
                description: description.trim(),
                latitude: initialCoords.latitude,
                longitude: initialCoords.longitude,
                crew_id: selectedCrewId || undefined,
            });

            showToast(t('meeting_point_created_success', 'Punto de encuentro fijado en el mapa'), 'success');
            onCreated(created);
            onClose();
            setTitle('');
            setDescription('');
        } catch (error) {
            console.error('Failed to create meeting point:', error);
            showToast(t('failed_create_meeting_point', 'Error al fijar el punto de encuentro'), 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.backdrop}>
                <View style={styles.card}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerTitleRow}>
                            <View style={styles.iconCircle}>
                                <Flag size={16} color="#ffffff" />
                            </View>
                            <View>
                                <Text style={styles.title}>
                                    {t('new_meeting_point_title', 'Punto de Encuentro')}
                                </Text>
                                <Text style={styles.subtitle}>
                                    {resortName || t('ski_resort', 'Estación de esquí')}
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={20} color={colors.textPrimary} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                        {/* Title input */}
                        <View>
                            <Text style={styles.inputLabel}>{t('meeting_point_title_label', 'Título del punto *')}</Text>
                            <TextInput
                                style={styles.input}
                                placeholder={t('meeting_point_title_placeholder', 'Ej: Comida en Restaurante, Salida de telesilla...')}
                                placeholderTextColor={colors.textLight}
                                value={title}
                                onChangeText={setTitle}
                            />
                        </View>

                        {/* Scheduled time input */}
                        <View>
                            <Text style={styles.inputLabel}>{t('meeting_point_time_label', 'Hora estimada')}</Text>
                            <View style={styles.timeInputRow}>
                                <Clock size={14} color={colors.textSecondary} />
                                <TextInput
                                    style={styles.timeInput}
                                    placeholder="14:00"
                                    placeholderTextColor={colors.textLight}
                                    value={meetTime}
                                    onChangeText={setMeetTime}
                                />
                            </View>
                        </View>

                        {/* Audience / Share with */}
                        <View>
                            <Text style={styles.inputLabel}>{t('share_with_label', 'Compartir con')}</Text>
                            <View style={styles.audienceRow}>
                                <TouchableOpacity
                                    style={[styles.audiencePill, selectedCrewId === null && styles.audiencePillActive]}
                                    onPress={() => setSelectedCrewId(null)}
                                >
                                    <Users size={12} color={selectedCrewId === null ? '#ffffff' : colors.textSecondary} />
                                    <Text style={[styles.audiencePillText, selectedCrewId === null && styles.audiencePillTextActive]}>
                                        {t('all_friends', 'Todos mis amigos')}
                                    </Text>
                                </TouchableOpacity>

                                {crews.map((c) => (
                                    <TouchableOpacity
                                        key={c.id}
                                        style={[styles.audiencePill, selectedCrewId === c.id && styles.audiencePillActive]}
                                        onPress={() => setSelectedCrewId(c.id)}
                                    >
                                        <Text style={[styles.audiencePillText, selectedCrewId === c.id && styles.audiencePillTextActive]}>
                                            {c.name}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Description input */}
                        <View>
                            <Text style={styles.inputLabel}>{t('meeting_point_desc_label', 'Nota / Instrucciones (opcional)')}</Text>
                            <TextInput
                                style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
                                placeholder={t('meeting_point_desc_placeholder', 'Nos vemos en las mesas de la terraza exterior')}
                                placeholderTextColor={colors.textLight}
                                value={description}
                                onChangeText={setDescription}
                                multiline
                            />
                        </View>

                        {/* Coordinates display indicator */}
                        <View style={styles.coordsBadge}>
                            <MapPin size={11} color={colors.textSecondary} />
                            <Text style={styles.coordsText}>
                                {initialCoords.latitude.toFixed(5)}, {initialCoords.longitude.toFixed(5)}
                            </Text>
                        </View>
                    </ScrollView>

                    {/* Submit Button */}
                    <TouchableOpacity
                        style={[styles.submitBtn, (!title.trim() || isSubmitting) && { opacity: 0.5 }]}
                        onPress={handleCreate}
                        disabled={!title.trim() || isSubmitting}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                            <Text style={styles.submitBtnText}>
                                {t('set_meeting_point_btn', 'Fijar Punto de Encuentro')}
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const getStyles = (colors: typeof LIGHT_COLORS) =>
    StyleSheet.create({
        backdrop: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.65)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: SPACING.md,
            zIndex: 9999,
        },
        card: {
            backgroundColor: colors.card,
            borderRadius: BORDER_RADIUS.xl,
            padding: SPACING.md,
            width: '100%',
            maxWidth: 420,
            maxHeight: '90%',
            borderWidth: 1,
            borderColor: colors.border,
            ...SHADOWS.lg,
            gap: 12,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: 6,
            borderBottomWidth: 1,
            borderColor: colors.border,
        },
        headerTitleRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
        },
        iconCircle: {
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: '#f59e0b',
            alignItems: 'center',
            justifyContent: 'center',
        },
        title: {
            fontSize: 15,
            fontWeight: 'bold',
            color: colors.textPrimary,
        },
        subtitle: {
            fontSize: 11,
            color: colors.textSecondary,
        },
        closeBtn: {
            padding: 4,
        },
        inputLabel: {
            fontSize: 11,
            fontWeight: '700',
            color: colors.textSecondary,
            textTransform: 'uppercase',
            marginBottom: 4,
        },
        input: {
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BORDER_RADIUS.md,
            paddingHorizontal: 12,
            paddingVertical: 8,
            fontSize: 13,
            color: colors.textPrimary,
        },
        timeInputRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BORDER_RADIUS.md,
            paddingHorizontal: 12,
            paddingVertical: 8,
        },
        timeInput: {
            flex: 1,
            fontSize: 13,
            color: colors.textPrimary,
            padding: 0,
        },
        audienceRow: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 6,
        },
        audiencePill: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: colors.surface,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: BORDER_RADIUS.round,
            borderWidth: 1,
            borderColor: colors.border,
        },
        audiencePillActive: {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
        },
        audiencePillText: {
            fontSize: 11,
            color: colors.textSecondary,
            fontWeight: '600',
        },
        audiencePillTextActive: {
            color: '#ffffff',
            fontWeight: '700',
        },
        coordsBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            alignSelf: 'flex-start',
            paddingVertical: 2,
        },
        coordsText: {
            fontSize: 10,
            color: colors.textLight,
        },
        submitBtn: {
            backgroundColor: colors.primary,
            paddingVertical: 12,
            borderRadius: BORDER_RADIUS.md,
            alignItems: 'center',
            justifyContent: 'center',
            ...SHADOWS.sm,
            marginTop: 4,
        },
        submitBtnText: {
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 'bold',
        },
    });
