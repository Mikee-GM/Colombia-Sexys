import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Action, Ctx, Update } from 'nestjs-telegraf';
import { Repository } from 'typeorm';
import { Context, Markup } from 'telegraf';
import { EmployeeOnboardingService } from '../employee-onboarding/employee-onboarding.service';
import { Usuarios } from '../users/entities/user.entity';
import { TelegramOnboardingService } from './telegram-onboarding.service';

@Update()
export class TelegramOnboardingUpdate {
  private readonly logger = new Logger(TelegramOnboardingUpdate.name);

  constructor(
    @InjectRepository(Usuarios)
    private readonly usersRepository: Repository<Usuarios>,
    private readonly onboardingService: EmployeeOnboardingService,
    private readonly telegramOnboardingService: TelegramOnboardingService,
  ) {}

  @Action('onboarding_read')
  async onRead(@Ctx() ctx: Context) {
    const user = await this.getStaffUser(ctx);
    if (!user) return;
    try {
      const progress = await this.onboardingService.startQuestionnaire(user.id);
      await ctx.answerCbQuery('Cuestionario iniciado');
      if (progress.question && user.telegramChatId) {
        await this.telegramOnboardingService.sendQuestion(
          user.telegramChatId,
          progress.question,
        );
      }
    } catch (error) {
      await this.answerError(ctx, error);
    }
  }

  @Action(/^quiz_answer:(.+)$/)
  async onAnswer(@Ctx() ctx: Context) {
    const user = await this.getStaffUser(ctx);
    if (!user) return;
    const match = (ctx as Context & { match?: RegExpExecArray }).match;
    const optionId = match?.[1];
    if (!optionId) return;

    try {
      const progress = await this.onboardingService.submitAnswer(
        user.id,
        optionId,
      );
      await ctx.answerCbQuery('Respuesta guardada');
      try {
        await ctx.editMessageReplyMarkup(undefined);
      } catch {
        // El mensaje pudo haber sido actualizado previamente.
      }

      if (!progress.completed && progress.question && user.telegramChatId) {
        await this.telegramOnboardingService.sendQuestion(
          user.telegramChatId,
          progress.question,
        );
        return;
      }

      if (progress.completed) {
        const resultMessage = progress.passed
          ? `✅ Cuestionario aprobado\n\nAciertos: ${progress.correctAnswers} de ${progress.totalQuestions}.`
          : `❌ Cuestionario no aprobado\n\nAciertos: ${progress.correctAnswers} de ${progress.totalQuestions}.`;
        await ctx.reply(
          resultMessage,
          progress.passed
            ? undefined
            : Markup.inlineKeyboard([
                Markup.button.callback(
                  '🔄 Volver a intentar',
                  'onboarding_retry',
                ),
              ]),
        );

        if (progress.passed && (user.rol === 'chofer' || user.rol === 'empleada')) {
          const menu =
            user.rol === 'empleada'
              ? Markup.keyboard([
                  ['📋 Servicios de hoy', '🟢 Servicio activo'],
                  ['🚗 Estatus del chofer'],
                ]).resize()
              : Markup.keyboard([
                  ['🟢 Quedar Disponible', '🔴 Quedar Inactivo'],
                ]).resize();

          await ctx.reply(
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
      await this.answerError(ctx, error);
    }
  }

  @Action('onboarding_retry')
  async onRetry(@Ctx() ctx: Context) {
    const user = await this.getStaffUser(ctx);
    if (!user) return;
    try {
      const progress = await this.onboardingService.startQuestionnaire(user.id);
      await ctx.answerCbQuery('Nuevo intento iniciado');
      if (progress.question && user.telegramChatId) {
        await this.telegramOnboardingService.sendQuestion(
          user.telegramChatId,
          progress.question,
        );
      }
    } catch (error) {
      await this.answerError(ctx, error);
    }
  }

  private async getStaffUser(ctx: Context): Promise<Usuarios | null> {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return null;
    const user = await this.usersRepository.findOne({
      where: { telegramChatId: telegramId },
    });
    if (!user || !['empleada', 'chofer', 'jefe'].includes(user.rol)) {
      await ctx.answerCbQuery(
        'Esta acción solo está disponible para personal vinculado',
        {
          show_alert: true,
        },
      );
      return null;
    }
    return user;
  }

  private async answerError(ctx: Context, error: unknown) {
    const message = error instanceof Error ? error.message : 'Error inesperado';
    this.logger.warn(message);
    try {
      await ctx.answerCbQuery(message, { show_alert: true });
    } catch {
      await ctx.reply(message);
    }
  }
}
