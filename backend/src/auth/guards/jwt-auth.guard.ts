import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { CsrfGuard } from './csrf.guard';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly csrfGuard = new CsrfGuard();

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const result = super.canActivate(context);
    if (result instanceof Observable) {
      return new Observable<boolean>((subscriber) => {
        result.subscribe({
          next: (authenticated) => {
            subscriber.next(
              authenticated && this.csrfGuard.canActivate(context),
            );
            subscriber.complete();
          },
          error: (error: unknown) => subscriber.error(error),
        });
      });
    }
    return Promise.resolve(result).then(
      (authenticated) => authenticated && this.csrfGuard.canActivate(context),
    );
  }
}
