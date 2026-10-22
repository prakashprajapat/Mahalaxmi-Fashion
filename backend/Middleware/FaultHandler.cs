namespace MahalaxmiApi.Middleware;

/// <summary>
/// What the caller gets when something in the API throws.
///
/// Before this there was no handler at all. An unhandled fault produced an
/// EMPTY 500: no body, nothing. Which matters more than it looks, because the
/// shop's fetch wrapper reads { message } out of the body to decide what to put
/// on the screen - an empty body meant every real fault reached the customer as
/// "Error 500", and reached the owner as nothing at all, because no line was
/// written saying which request it was.
///
/// Two audiences, two different amounts of detail, and the split is the whole
/// point:
///
///   The log gets the exception, the method, the path and the request id. That
///   is what a fault is actually diagnosed from.
///
///   The caller gets a sentence and the request id, and nothing else. Exception
///   text names our libraries, our provider calls, sometimes the URL a token
///   was posted to - a map of the inside of the server, handed to whoever made
///   the request fail. OrdersController and CustomersController already made
///   this distinction by hand, in a catch block each; this is the same
///   judgement applied to the faults nobody wrote a catch for.
///
/// The request id is the bit that makes the pairing work: the customer can read
/// it off the screen, and it is what the owner searches the log for.
/// </summary>
public sealed class FaultHandlerMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<FaultHandlerMiddleware> _log;

    public FaultHandlerMiddleware(RequestDelegate next, ILogger<FaultHandlerMiddleware> log)
    {
        _next = next;
        _log = log;
    }

    public async Task InvokeAsync(HttpContext http)
    {
        try
        {
            await _next(http);
        }
        catch (Exception ex)
        {
            var id = http.RequestId();

            _log.LogError(ex,
                "Unhandled fault on {Method} {Path} ({RequestId})",
                http.Request.Method, http.Request.Path.Value, id);

            // Nothing can be sent once the response has begun - the status line
            // and headers are already on the wire. Say so in the log rather
            // than throwing a second exception on top of the first.
            if (http.Response.HasStarted)
            {
                _log.LogWarning(
                    "Response had already started, so the caller gets a truncated reply ({RequestId})", id);
                return;
            }

            http.Response.Clear();
            http.Response.StatusCode = StatusCodes.Status500InternalServerError;
            http.Response.Headers[RequestContextMiddleware.HeaderName] = id;

            await http.Response.WriteAsJsonAsync(new
            {
                success = false,
                message = "Something went wrong at our end. Please try again in a moment.",
                requestId = id,
            });
        }
    }
}

public static class FaultHandlerExtensions
{
    public static IApplicationBuilder UseFaultHandler(this IApplicationBuilder app)
        => app.UseMiddleware<FaultHandlerMiddleware>();
}
