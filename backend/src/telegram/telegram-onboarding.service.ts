import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Context, Markup, Telegraf } from 'telegraf';
import { EmployeeOnboardingService } from '../employee-onboarding/employee-onboarding.service';
import { EmployeeOnboarding } from '../employee-onboarding/entities/employee-onboarding.entity';
import { RegulationQuestion } from '../employee-onboarding/entities/regulation-question.entity';

@Injectable()
export class TelegramOnboardingService {
  private readonly logger = new Logger(TelegramOnboardingService.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly onboardingService: EmployeeOnboardingService,
  ) {}

  async handleStaffLinked(userId: string): Promise<void> {
    try {
      await this.onboardingService.ensureCurrentAssignmentForUser(userId);
      const assignment =
        await this.onboardingService.getActiveAssignmentForUser(userId);
      await this.deliverAssignment(assignment);

      // If onboarding is already completed, send the location request and menu directly
      if (assignment.status === 'completed' && assignment.user) {
        const rol = assignment.user.rol;
        const chatId = assignment.user.telegramChatId;
        if (chatId && (rol === 'chofer' || rol === 'empleada')) {
          const menu =
            rol === 'empleada'
              ? Markup.keyboard([
                  ['📋 Servicios de hoy', '🟢 Servicio activo'],
                  ['🚗 Estatus del chofer'],
                ]).resize()
              : Markup.keyboard([
                  ['🟢 Quedar Disponible', '🔴 Quedar Inactivo'],
                ]).resize();

          await this.bot.telegram.sendMessage(
            chatId,
            `📍 *IMPORTANTE: Compartir Ubicación en Tiempo Real*\n\n` +
              `Para recibir y gestionar servicios correctamente, debes compartir tu *Ubicación en tiempo real* (Live Location):\n\n` +
              `1. Toca el botón de adjuntar (📎).\n` +
              `2. Selecciona *Ubicación*.\n` +
              `3. Elige *Compartir mi ubicación en tiempo real...* (selecciona la duración deseada, ej. 8 horas).\n\n` +
              `⚠️ *Atención:* NO envíes la ubicación actual estática (un solo pin), ya que el sistema requiere rastreo continuo en tiempo real.`,
            {
              parse_mode: 'Markdown',
              ...menu,
            },
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `No fue posible iniciar la incorporación para el usuario ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async deliverAssignment(assignment: EmployeeOnboarding): Promise<void> {
    const chatId = assignment.user?.telegramChatId;
    if (!chatId) return;

    try {
      if (!assignment.welcomeSentAt) {
        await this.bot.telegram.sendMessage(
          chatId,
          '🎉 ¡Te damos la bienvenida al equipo!\n\nTu cuenta ha sido vinculada correctamente. A continuación recibirás el reglamento básico de trabajo. Léelo con atención porque después deberás responder un breve cuestionario.',
        );
        await this.onboardingService.markWelcomeSent(assignment.id);
      }

      if (!assignment.regulationSentAt) {
        const regulation =
          await this.onboardingService.getRegulationForAssignment(assignment);
        const publicationNotice = assignment.isRenewal
          ? '📢 El reglamento de trabajo fue actualizado. Debes leerlo y realizar nuevamente el cuestionario.\n\n'
          : '';
        const chunks = this.splitMessage(
          `${publicationNotice}📋 ${regulation.title}\n\n${regulation.content}`,
        );
        for (let index = 0; index < chunks.length; index += 1) {
          const isLast = index === chunks.length - 1;
          await this.bot.telegram.sendMessage(chatId, chunks[index], {
            ...(isLast
              ? Markup.inlineKeyboard([
                  Markup.button.callback(
                    '✅ Ya leí el reglamento',
                    'onboarding_read',
                  ),
                ])
              : {}),
          });
        }
        await this.onboardingService.markRegulationSent(assignment.id);
      }
    } catch (error) {
      await this.onboardingService.markDeliveryError(assignment.id, error);
      throw error;
    }
  }

  async sendQuestion(chatId: string, question: RegulationQuestion) {
    const buttons = question.options.map((option) => [
      Markup.button.callback(option.text, `quiz_answer:${option.id}`),
    ]);
    await this.bot.telegram.sendMessage(
      chatId,
      `Pregunta ${question.order}\n\n${question.text}`,
      Markup.inlineKeyboard(buttons),
    );
  }

  async sendReminder(assignment: EmployeeOnboarding) {
    const chatId = assignment.user?.telegramChatId;
    if (!chatId) return;
    try {
      await this.bot.telegram.sendMessage(
        chatId,
        '⏰ Recordatorio\n\nAún tienes pendiente el cuestionario del reglamento. Presiona el botón para comenzar o continuar.',
        Markup.inlineKeyboard([
          Markup.button.callback('📝 Hacer cuestionario', 'onboarding_read'),
        ]),
      );
      await this.onboardingService.markReminderSent(assignment.id);
    } catch (error) {
      await this.onboardingService.markDeliveryError(assignment.id, error);
      throw error;
    }
  }

  private splitMessage(message: string, maxLength = 3900): string[] {
    if (message.length <= maxLength) return [message];
    const chunks: string[] = [];
    let remaining = message;
    while (remaining.length > maxLength) {
      let splitAt = remaining.lastIndexOf('\n', maxLength);
      if (splitAt < maxLength / 2) splitAt = maxLength;
      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
  }
}
